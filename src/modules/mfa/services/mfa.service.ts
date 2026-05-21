import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AppException, NotFoundAppException } from '@common/exceptions';
import { FEDERATION_CONFIG_KEY, type FederationConfig } from '@config/federation.config';
import { PrismaService } from '@infrastructure/database';
import { AuditAction, AuditResource, AuditService } from '@modules/audit';
import { PasswordService } from '@modules/auth/services/password.service';

import { MFA_ERROR_CODES } from '../constants';
import { type BackupCodesResponseDto, type MfaSetupResponseDto } from '../dto';
import { generateBackupCodes, hashBackupCode, normalizeBackupCode } from '../utils';

import { SecretsCryptoService } from './secrets-crypto.service';
import { TotpService } from './totp.service';

@Injectable()
export class MfaService {
  private readonly federationConfig: FederationConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly totpService: TotpService,
    private readonly secretsCrypto: SecretsCryptoService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.federationConfig = configService.getOrThrow<FederationConfig>(FEDERATION_CONFIG_KEY);
  }

  async setup(userId: string): Promise<MfaSetupResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundAppException('User not found');
    }

    const existing = await this.prisma.mfaSecret.findUnique({ where: { userId } });
    if (existing?.isEnabled) {
      throw new AppException({
        code: MFA_ERROR_CODES.MFA_ALREADY_ENABLED,
        message: 'MFA is already enabled',
        status: 409,
      });
    }

    const { base32, otpauthUrl } = this.totpService.generateSecret(user.email);
    const secretEncrypted = this.secretsCrypto.encrypt(base32);

    await this.prisma.mfaSecret.upsert({
      where: { userId },
      create: { userId, secretEncrypted, isEnabled: false },
      update: { secretEncrypted, isEnabled: false },
    });

    const qrCodeDataUrl = await this.totpService.toQrCodeDataUrl(otpauthUrl);

    await this.auditService.record({
      action: AuditAction.MFA_SETUP_INITIATED,
      resource: AuditResource.MFA_FACTOR,
      resourceId: userId,
      actor: { userId, email: user.email },
    });

    return { secret: base32, otpauthUrl, qrCodeDataUrl };
  }

  async verifySetup(userId: string, code: string): Promise<BackupCodesResponseDto> {
    const secret = await this.prisma.mfaSecret.findUnique({ where: { userId } });
    if (!secret) {
      throw new AppException({
        code: MFA_ERROR_CODES.MFA_SETUP_NOT_INITIATED,
        message: 'MFA setup has not been initiated',
        status: 400,
      });
    }
    if (secret.isEnabled) {
      throw new AppException({
        code: MFA_ERROR_CODES.MFA_ALREADY_ENABLED,
        message: 'MFA is already enabled',
        status: 409,
      });
    }

    const plain = this.secretsCrypto.decrypt(secret.secretEncrypted);
    if (!this.totpService.verifyCode(plain, code)) {
      await this.auditService.record({
        action: AuditAction.MFA_FAILED,
        resource: AuditResource.MFA_FACTOR,
        resourceId: userId,
        status: 'failure',
        actor: { userId },
        metadata: { stage: 'setup' },
      });
      throw new AppException({
        code: MFA_ERROR_CODES.INVALID_MFA_CODE,
        message: 'Invalid MFA code',
        status: 400,
      });
    }

    const { codes, generatedAt } = await this.replaceBackupCodes(userId);

    await this.prisma.mfaSecret.update({
      where: { userId },
      data: { isEnabled: true, lastUsedAt: new Date() },
    });

    await this.auditService.record({
      action: AuditAction.MFA_ENABLED,
      resource: AuditResource.MFA_FACTOR,
      resourceId: userId,
      actor: { userId },
    });

    return { codes, generatedAt };
  }

  async disable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundAppException('User not found');
    }

    const passwordOk = await this.passwordService.compare(password, user.passwordHash);
    if (!passwordOk) {
      throw new AppException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
        status: 401,
      });
    }

    const secret = await this.prisma.mfaSecret.findUnique({ where: { userId } });
    if (!secret || !secret.isEnabled) {
      throw new AppException({
        code: MFA_ERROR_CODES.MFA_NOT_ENABLED,
        message: 'MFA is not enabled',
        status: 400,
      });
    }

    const plain = this.secretsCrypto.decrypt(secret.secretEncrypted);
    if (!this.totpService.verifyCode(plain, code)) {
      throw new AppException({
        code: MFA_ERROR_CODES.INVALID_MFA_CODE,
        message: 'Invalid MFA code',
        status: 400,
      });
    }

    await this.prisma.$transaction([
      this.prisma.backupCode.deleteMany({ where: { userId } }),
      this.prisma.mfaSecret.delete({ where: { userId } }),
    ]);

    await this.auditService.record({
      action: AuditAction.MFA_DISABLED,
      resource: AuditResource.MFA_FACTOR,
      resourceId: userId,
      actor: { userId, email: user.email },
    });
  }

  async listBackupCodeStatus(userId: string): Promise<{ total: number; remaining: number }> {
    const all = await this.prisma.backupCode.findMany({ where: { userId } });
    return {
      total: all.length,
      remaining: all.filter((entry) => entry.usedAt === null).length,
    };
  }

  async regenerateBackupCodes(userId: string, password: string): Promise<BackupCodesResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundAppException('User not found');
    }

    const passwordOk = await this.passwordService.compare(password, user.passwordHash);
    if (!passwordOk) {
      throw new AppException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials',
        status: 401,
      });
    }

    const secret = await this.prisma.mfaSecret.findUnique({ where: { userId } });
    if (!secret || !secret.isEnabled) {
      throw new AppException({
        code: MFA_ERROR_CODES.MFA_NOT_ENABLED,
        message: 'MFA is not enabled',
        status: 400,
      });
    }

    const result = await this.replaceBackupCodes(userId);

    await this.auditService.record({
      action: AuditAction.MFA_BACKUP_CODES_REGENERATED,
      resource: AuditResource.MFA_FACTOR,
      resourceId: userId,
      actor: { userId, email: user.email },
    });

    return result;
  }

  async verifyTotp(userId: string, code: string): Promise<boolean> {
    const secret = await this.prisma.mfaSecret.findUnique({ where: { userId } });
    if (!secret || !secret.isEnabled) {
      return false;
    }
    const plain = this.secretsCrypto.decrypt(secret.secretEncrypted);
    const ok = this.totpService.verifyCode(plain, code);
    if (ok) {
      await this.prisma.mfaSecret.update({
        where: { userId },
        data: { lastUsedAt: new Date() },
      });
    }
    return ok;
  }

  async consumeBackupCode(userId: string, rawCode: string): Promise<boolean> {
    const normalized = normalizeBackupCode(rawCode);
    const hash = hashBackupCode(normalized);
    const entry = await this.prisma.backupCode.findUnique({ where: { codeHash: hash } });
    if (!entry || entry.userId !== userId || entry.usedAt) {
      return false;
    }
    await this.prisma.backupCode.update({
      where: { id: entry.id },
      data: { usedAt: new Date() },
    });
    await this.auditService.record({
      action: AuditAction.MFA_BACKUP_CODE_USED,
      resource: AuditResource.MFA_FACTOR,
      resourceId: userId,
      actor: { userId },
    });
    return true;
  }

  async isMfaEnabled(userId: string): Promise<boolean> {
    const secret = await this.prisma.mfaSecret.findUnique({ where: { userId } });
    return Boolean(secret?.isEnabled);
  }

  private async replaceBackupCodes(userId: string): Promise<BackupCodesResponseDto> {
    const count = this.federationConfig.mfaBackupCodeCount;
    const codes = generateBackupCodes(count);
    const rows = codes.map((code) => ({ userId, codeHash: hashBackupCode(code) }));

    await this.prisma.$transaction(async (tx) => {
      await tx.backupCode.deleteMany({ where: { userId } });
      await tx.backupCode.createMany({ data: rows });
    });

    return { codes, generatedAt: new Date() };
  }
}
