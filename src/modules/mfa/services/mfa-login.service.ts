import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type User, UserStatus } from '@prisma/client';

import { AppException } from '@common/exceptions';
import { type JwtConfig, JWT_CONFIG_KEY } from '@config/jwt.config';
import { PrismaService } from '@infrastructure/database';
import { AuditAction, AuditResource, AuditService } from '@modules/audit';
import {
  type JwtAccessPayload,
  type LoginMetadata,
  type TokenPair,
} from '@modules/auth/interfaces';
import { ActiveContextService } from '@modules/auth/services/active-context.service';
import { LoginHooksService } from '@modules/auth/services/login-hooks.service';
import { PasswordService } from '@modules/auth/services/password.service';
import { SessionService } from '@modules/auth/services/session.service';
import { TokenService } from '@modules/auth/services/token.service';

import { MFA_ERROR_CODES } from '../constants';
import {
  type MfaChallengeResponseDto,
  type VerifyMfaChallengeDto,
  MfaChallengeMethod,
} from '../dto';

import { MfaChallengeService } from './mfa-challenge.service';
import { MfaService } from './mfa.service';

export interface MfaLoginResult {
  user: Omit<User, 'passwordHash'>;
  tokens: TokenPair;
  sessionId: string;
}

@Injectable()
export class MfaLoginService implements OnModuleInit {
  private readonly jwtConfig: JwtConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mfaService: MfaService,
    private readonly mfaChallengeService: MfaChallengeService,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
    private readonly activeContextService: ActiveContextService,
    private readonly auditService: AuditService,
    private readonly passwordService: PasswordService,
    private readonly loginHooks: LoginHooksService,
    configService: ConfigService,
  ) {
    this.jwtConfig = configService.getOrThrow<JwtConfig>(JWT_CONFIG_KEY);
  }

  onModuleInit(): void {
    this.loginHooks.registerMfaHook(async (user, metadata) => {
      const enabled = await this.mfaService.isMfaEnabled(user.id);
      if (!enabled) {
        return null;
      }
      const challenge = await this.issueChallenge(user.id, metadata);
      return {
        mfaRequired: true,
        challengeToken: challenge.challengeToken,
        challengeExpiresAt: challenge.expiresAt,
        allowedMethods: challenge.allowedMethods,
      };
    });
  }

  async issueChallenge(userId: string, metadata: LoginMetadata): Promise<MfaChallengeResponseDto> {
    const issued = await this.mfaChallengeService.issue(userId, {
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      deviceName: metadata.deviceName,
    });

    await this.auditService.record({
      action: AuditAction.MFA_CHALLENGED,
      resource: AuditResource.MFA_FACTOR,
      resourceId: userId,
      actor: { userId },
    });

    return {
      challengeToken: issued.challengeToken,
      expiresAt: issued.expiresAt,
      allowedMethods: [MfaChallengeMethod.TOTP, MfaChallengeMethod.BACKUP_CODE],
    };
  }

  async verifyAndCompleteLogin(
    dto: VerifyMfaChallengeDto,
    metadata: LoginMetadata,
  ): Promise<MfaLoginResult> {
    const challenge = await this.mfaChallengeService.consume(dto.challengeToken);
    const user = await this.prisma.user.findUnique({ where: { id: challenge.userId } });
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new AppException({
        code: 'ACCOUNT_INACTIVE',
        message: 'Account is not active',
        status: 403,
      });
    }

    const ok =
      dto.method === MfaChallengeMethod.TOTP
        ? await this.mfaService.verifyTotp(user.id, dto.code)
        : await this.mfaService.consumeBackupCode(user.id, dto.code);

    if (!ok) {
      await this.mfaChallengeService.recordAttempt(challenge.id, false);
      await this.auditService.record({
        action: AuditAction.MFA_FAILED,
        resource: AuditResource.MFA_FACTOR,
        resourceId: user.id,
        status: 'failure',
        actor: { userId: user.id, email: user.email },
        metadata: { method: dto.method },
      });
      throw new AppException({
        code:
          dto.method === MfaChallengeMethod.TOTP
            ? MFA_ERROR_CODES.INVALID_MFA_CODE
            : MFA_ERROR_CODES.INVALID_BACKUP_CODE,
        message: 'Invalid MFA code',
        status: 401,
      });
    }

    await this.mfaChallengeService.recordAttempt(challenge.id, true);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: new Date() },
      });
      return this.sessionService.createSession(user.id, metadata, tx);
    });

    const orgCtx = await this.activeContextService.resolveDefault(user.id);
    const payload: JwtAccessPayload = {
      sub: user.id,
      email: user.email,
      sessionId: created.session.id,
      tokenVersion: user.tokenVersion,
      organizationId: orgCtx.organizationId,
      membershipId: orgCtx.membershipId,
      roles: orgCtx.roles,
      permissionsVersion: orgCtx.permissionsVersion,
      attributesVersion: orgCtx.attributesVersion,
    };
    const accessToken = await this.tokenService.signAccessToken(payload);

    await this.auditService.record({
      action: AuditAction.MFA_VERIFIED,
      resource: AuditResource.MFA_FACTOR,
      resourceId: user.id,
      actor: { userId: user.id, email: user.email },
      metadata: { method: dto.method },
    });
    await this.auditService.record({
      action: AuditAction.LOGIN_SUCCESS,
      resource: AuditResource.SESSION,
      resourceId: created.session.id,
      actor: { userId: user.id, email: user.email },
      metadata: { mfa: true },
    });

    const { passwordHash: _ph, ...safeUser } = user;
    return {
      user: safeUser,
      sessionId: created.session.id,
      tokens: {
        accessToken,
        refreshToken: created.refreshToken,
        accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        refreshTokenExpiresAt: created.refreshTokenExpiresAt,
      },
    };
  }

  getJwtIssuer(): string {
    return this.jwtConfig.issuer;
  }

  async reissueChallenge(
    email: string,
    password: string,
    metadata: LoginMetadata,
  ): Promise<MfaChallengeResponseDto> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new AppException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        status: 401,
      });
    }
    const ok = await this.passwordService.compare(password, user.passwordHash);
    if (!ok) {
      throw new AppException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        status: 401,
      });
    }
    const enabled = await this.mfaService.isMfaEnabled(user.id);
    if (!enabled) {
      throw new AppException({
        code: MFA_ERROR_CODES.MFA_NOT_ENABLED,
        message: 'MFA is not enabled on this account',
        status: 400,
      });
    }
    return this.issueChallenge(user.id, metadata);
  }
}
