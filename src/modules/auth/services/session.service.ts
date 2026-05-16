import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Prisma, type RefreshToken, type Session } from '@prisma/client';
import { v7 as uuidv7 } from 'uuid';

import { AppException } from '@common/exceptions';
import { type AuthConfig, AUTH_CONFIG_KEY } from '@config/auth.config';
import { CacheService } from '@infrastructure/cache';
import { PrismaService } from '@infrastructure/database';

import { AUTH_CACHE_KEYS, AUTH_ERROR_CODES, REFRESH_TOKEN_BYTES } from '../constants';
import { type LoginMetadata } from '../interfaces';
import { generateSecureToken, hashToken } from '../utils';

export interface CreatedSession {
  session: Session;
  refreshToken: string;
  refreshTokenRecord: RefreshToken;
  refreshTokenExpiresAt: Date;
}

export interface RotatedRefresh {
  session: Session;
  refreshToken: string;
  refreshTokenRecord: RefreshToken;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly authConfig: AuthConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    configService: ConfigService,
  ) {
    this.authConfig = configService.getOrThrow<AuthConfig>(AUTH_CONFIG_KEY);
  }

  async createSession(
    userId: string,
    metadata: LoginMetadata,
    tx?: Prisma.TransactionClient,
  ): Promise<CreatedSession> {
    const client = tx ?? this.prisma;
    const familyId = uuidv7();
    const expiresAt = new Date(Date.now() + this.authConfig.sessionTtlMs);

    const session = await client.session.create({
      data: {
        userId,
        familyId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        deviceName: metadata.deviceName,
        expiresAt,
      },
    });

    const { refreshToken, refreshTokenRecord, refreshTokenExpiresAt } =
      await this.issueRefreshToken(userId, session.id, familyId, expiresAt, client);

    await this.cache.set(
      AUTH_CACHE_KEYS.session(session.id),
      { userId, familyId },
      {
        ttlSeconds: Math.floor(this.authConfig.sessionTtlMs / 1000),
      },
    );

    return { session, refreshToken, refreshTokenRecord, refreshTokenExpiresAt };
  }

  async rotateRefreshToken(
    rawRefreshToken: string,
    metadata: LoginMetadata,
  ): Promise<RotatedRefresh> {
    const tokenHash = hashToken(rawRefreshToken);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.refreshToken.findUnique({
        where: { tokenHash },
        include: { session: true },
      });

      if (!existing) {
        throw new AppException({
          code: AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
          message: 'Invalid refresh token',
          status: 401,
        });
      }

      if (existing.revokedAt) {
        this.logger.warn(
          `Refresh token reuse detected for family ${existing.familyId} (userId=${existing.userId})`,
        );
        await this.revokeFamily(existing.familyId, 'reuse', tx);
        throw new AppException({
          code: AUTH_ERROR_CODES.REFRESH_TOKEN_REUSE_DETECTED,
          message: 'Refresh token reuse detected; session revoked',
          status: 401,
        });
      }

      if (existing.expiresAt.getTime() <= Date.now()) {
        throw new AppException({
          code: AUTH_ERROR_CODES.INVALID_REFRESH_TOKEN,
          message: 'Refresh token expired',
          status: 401,
        });
      }

      if (existing.session.revokedAt) {
        throw new AppException({
          code: AUTH_ERROR_CODES.SESSION_REVOKED,
          message: 'Session has been revoked',
          status: 401,
        });
      }

      const issued = await this.issueRefreshToken(
        existing.userId,
        existing.sessionId,
        existing.familyId,
        existing.session.expiresAt,
        tx,
      );

      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedByTokenId: issued.refreshTokenRecord.id },
      });

      const session = await tx.session.update({
        where: { id: existing.sessionId },
        data: {
          lastActivityAt: new Date(),
          ipAddress: metadata.ipAddress ?? existing.session.ipAddress,
          userAgent: metadata.userAgent ?? existing.session.userAgent,
        },
      });

      return {
        session,
        refreshToken: issued.refreshToken,
        refreshTokenRecord: issued.refreshTokenRecord,
        refreshTokenExpiresAt: issued.refreshTokenExpiresAt,
      };
    });
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findFirst({ where: { id: sessionId, userId } });
      if (!session) {
        throw new AppException({
          code: AUTH_ERROR_CODES.SESSION_NOT_FOUND,
          message: 'Session not found',
          status: 404,
        });
      }
      if (session.revokedAt) {
        return;
      }
      await tx.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.cache.delete(AUTH_CACHE_KEYS.session(sessionId));
  }

  async revokeAllSessionsForUser(userId: string, exceptSessionId?: string): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      select: { id: true },
    });
    if (sessions.length === 0) {
      return;
    }

    const sessionIds = sessions.map((s) => s.id);
    await this.prisma.$transaction([
      this.prisma.session.updateMany({
        where: { id: { in: sessionIds } },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessionId: { in: sessionIds }, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.cache.delete(...sessionIds.map((id) => AUTH_CACHE_KEYS.session(id)));
  }

  async listActiveSessionsForUser(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastActivityAt: 'desc' },
    });
  }

  async findSessionById(sessionId: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { id: sessionId } });
  }

  private async issueRefreshToken(
    userId: string,
    sessionId: string,
    familyId: string,
    expiresAt: Date,
    tx: Prisma.TransactionClient,
  ): Promise<{
    refreshToken: string;
    refreshTokenRecord: RefreshToken;
    refreshTokenExpiresAt: Date;
  }> {
    const refreshToken = generateSecureToken(REFRESH_TOKEN_BYTES);
    const tokenHash = hashToken(refreshToken);
    const refreshTokenRecord = await tx.refreshToken.create({
      data: {
        userId,
        sessionId,
        familyId,
        tokenHash,
        expiresAt,
      },
    });
    return { refreshToken, refreshTokenRecord, refreshTokenExpiresAt: expiresAt };
  }

  private async revokeFamily(
    familyId: string,
    reason: 'reuse' | 'logout',
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const now = new Date();
    await tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now, ...(reason === 'reuse' ? { reuseDetectedAt: now } : {}) },
    });
    await tx.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
