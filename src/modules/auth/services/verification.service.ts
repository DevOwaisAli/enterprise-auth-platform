import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Prisma } from '@prisma/client';

import { AppException } from '@common/exceptions';
import { type AuthConfig, AUTH_CONFIG_KEY } from '@config/auth.config';
import { PrismaService } from '@infrastructure/database';

import { AUTH_ERROR_CODES, RESET_TOKEN_BYTES, VERIFICATION_TOKEN_BYTES } from '../constants';
import { generateSecureToken, hashToken } from '../utils';

export interface IssuedToken {
  rawToken: string;
  expiresAt: Date;
}

@Injectable()
export class VerificationService {
  private readonly authConfig: AuthConfig;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.authConfig = configService.getOrThrow<AuthConfig>(AUTH_CONFIG_KEY);
  }

  async issueEmailVerificationToken(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<IssuedToken> {
    const client = tx ?? this.prisma;
    const rawToken = generateSecureToken(VERIFICATION_TOKEN_BYTES);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.authConfig.emailVerificationTokenTtlMs);

    await client.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return { rawToken, expiresAt };
  }

  async consumeEmailVerificationToken(rawToken: string): Promise<{ userId: string }> {
    const tokenHash = hashToken(rawToken);
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.emailVerificationToken.findUnique({ where: { tokenHash } });
      if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
        throw new AppException({
          code: AUTH_ERROR_CODES.INVALID_VERIFICATION_TOKEN,
          message: 'Invalid or expired verification token',
          status: 400,
        });
      }

      await tx.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: record.userId },
        data: { isEmailVerified: true },
      });

      return { userId: record.userId };
    });
  }

  async issuePasswordResetToken(userId: string): Promise<IssuedToken> {
    const rawToken = generateSecureToken(RESET_TOKEN_BYTES);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.authConfig.passwordResetTokenTtlMs);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: { userId, tokenHash, expiresAt },
      });
    });

    return { rawToken, expiresAt };
  }

  async consumePasswordResetToken(rawToken: string): Promise<{ userId: string }> {
    const tokenHash = hashToken(rawToken);
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
        throw new AppException({
          code: AUTH_ERROR_CODES.INVALID_RESET_TOKEN,
          message: 'Invalid or expired reset token',
          status: 400,
        });
      }
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      return { userId: record.userId };
    });
  }
}
