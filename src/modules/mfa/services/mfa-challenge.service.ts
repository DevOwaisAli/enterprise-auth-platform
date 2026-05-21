import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type MfaChallenge } from '@prisma/client';

import { AppException } from '@common/exceptions';
import { FEDERATION_CONFIG_KEY, type FederationConfig } from '@config/federation.config';
import { PrismaService } from '@infrastructure/database';
import { generateSecureToken, hashToken } from '@modules/auth/utils';

import { MFA_CONSTANTS, MFA_ERROR_CODES } from '../constants';

export interface IssuedChallenge {
  challengeToken: string;
  expiresAt: Date;
  challenge: MfaChallenge;
}

export interface ChallengeDevice {
  ipAddress?: string;
  userAgent?: string;
  deviceName?: string;
}

@Injectable()
export class MfaChallengeService {
  private readonly federationConfig: FederationConfig;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.federationConfig = configService.getOrThrow<FederationConfig>(FEDERATION_CONFIG_KEY);
  }

  async issue(userId: string, metadata: ChallengeDevice): Promise<IssuedChallenge> {
    const challengeToken = generateSecureToken(this.federationConfig.mfaChallengeTokenBytes);
    const tokenHash = hashToken(challengeToken);
    const expiresAt = new Date(Date.now() + this.federationConfig.mfaChallengeTtlMs);

    const challenge = await this.prisma.mfaChallenge.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        deviceName: metadata.deviceName,
      },
    });

    return { challengeToken, expiresAt, challenge };
  }

  async consume(rawToken: string): Promise<MfaChallenge> {
    const tokenHash = hashToken(rawToken);

    return this.prisma.$transaction(async (tx) => {
      const challenge = await tx.mfaChallenge.findUnique({ where: { tokenHash } });
      if (!challenge) {
        throw new AppException({
          code: MFA_ERROR_CODES.MFA_CHALLENGE_NOT_FOUND,
          message: 'MFA challenge not found',
          status: 401,
        });
      }
      if (challenge.consumedAt) {
        throw new AppException({
          code: MFA_ERROR_CODES.MFA_CHALLENGE_USED,
          message: 'MFA challenge already used',
          status: 401,
        });
      }
      if (challenge.expiresAt.getTime() <= Date.now()) {
        throw new AppException({
          code: MFA_ERROR_CODES.MFA_CHALLENGE_EXPIRED,
          message: 'MFA challenge expired',
          status: 401,
        });
      }
      if (challenge.attempts >= MFA_CONSTANTS.MAX_CHALLENGE_ATTEMPTS) {
        throw new AppException({
          code: MFA_ERROR_CODES.MFA_TOO_MANY_ATTEMPTS,
          message: 'Too many failed attempts; please re-authenticate',
          status: 429,
        });
      }
      return challenge;
    });
  }

  async recordAttempt(challengeId: string, success: boolean): Promise<void> {
    await this.prisma.mfaChallenge.update({
      where: { id: challengeId },
      data: success
        ? { consumedAt: new Date(), attempts: { increment: 1 } }
        : { attempts: { increment: 1 } },
    });
  }
}
