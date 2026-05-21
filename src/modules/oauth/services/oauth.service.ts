import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { type OAuthProvider, type Prisma, type User, UserStatus } from '@prisma/client';

import { AppException, NotFoundAppException } from '@common/exceptions';
import { PrismaService } from '@infrastructure/database';
import { AuditAction, AuditResource, AuditService } from '@modules/audit';
import { type LoginMetadata, type TokenPair } from '@modules/auth/interfaces';
import { ActiveContextService } from '@modules/auth/services/active-context.service';
import { PasswordService } from '@modules/auth/services/password.service';
import { SessionService } from '@modules/auth/services/session.service';
import { TokenService } from '@modules/auth/services/token.service';
import { SecretsCryptoService } from '@modules/mfa/services';

import { OAUTH_ERROR_CODES } from '../constants';
import { type NormalizedOAuthProfile, type OAuthTokenSet } from '../interfaces';

export interface OAuthLoginResult {
  user: Omit<User, 'passwordHash'>;
  tokens: TokenPair;
  sessionId: string;
  isNewUser: boolean;
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
    private readonly activeContextService: ActiveContextService,
    private readonly passwordService: PasswordService,
    private readonly secretsCrypto: SecretsCryptoService,
    private readonly auditService: AuditService,
  ) {}

  async loginOrSignup(
    profile: NormalizedOAuthProfile,
    tokens: OAuthTokenSet,
    metadata: LoginMetadata,
  ): Promise<OAuthLoginResult> {
    if (!profile.email) {
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_PROFILE_INCOMPLETE,
        message: 'OAuth provider did not return an email address',
        status: 400,
      });
    }
    const email = profile.email.trim().toLowerCase();

    const existingAccount = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: profile.provider,
          providerUserId: profile.providerUserId,
        },
      },
      include: { user: true },
    });

    let user: User;
    let isNewUser = false;

    if (existingAccount) {
      user = existingAccount.user;
      await this.persistTokens(existingAccount.id, tokens, profile);
    } else {
      const existingUser = await this.prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        // Same-email merge: link this provider to the existing account.
        user = existingUser;
        await this.createLinkedAccount(user.id, profile, tokens);
      } else {
        user = await this.createUserFromProfile(profile, email);
        isNewUser = true;
        await this.createLinkedAccount(user.id, profile, tokens);
      }
    }

    if (
      user.deletedAt ||
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.INACTIVE
    ) {
      await this.auditService.record({
        action: AuditAction.OAUTH_LOGIN_FAILURE,
        resource: AuditResource.OAUTH_ACCOUNT,
        resourceId: user.id,
        status: 'failure',
        actor: { userId: user.id, email: user.email },
        metadata: { provider: profile.provider, reason: 'account_inactive' },
      });
      throw new AppException({
        code: 'ACCOUNT_INACTIVE',
        message: 'Account is not active',
        status: 403,
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockUntil: null },
      });
      return this.sessionService.createSession(user.id, metadata, tx);
    });

    const orgCtx = await this.activeContextService.resolveDefault(user.id);
    const accessToken = await this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      sessionId: created.session.id,
      tokenVersion: user.tokenVersion,
      organizationId: orgCtx.organizationId,
      membershipId: orgCtx.membershipId,
      roles: orgCtx.roles,
      permissionsVersion: orgCtx.permissionsVersion,
      attributesVersion: orgCtx.attributesVersion,
    });

    await this.auditService.record({
      action: AuditAction.OAUTH_LOGIN_SUCCESS,
      resource: AuditResource.OAUTH_ACCOUNT,
      resourceId: user.id,
      actor: { userId: user.id, email: user.email },
      metadata: { provider: profile.provider, isNewUser },
    });

    const { passwordHash: _ph, ...safeUser } = user;
    return {
      user: safeUser,
      sessionId: created.session.id,
      isNewUser,
      tokens: {
        accessToken,
        refreshToken: created.refreshToken,
        accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        refreshTokenExpiresAt: created.refreshTokenExpiresAt,
      },
    };
  }

  async linkAccount(
    userId: string,
    profile: NormalizedOAuthProfile,
    tokens: OAuthTokenSet,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundAppException('User not found');
    }

    const existing = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: profile.provider,
          providerUserId: profile.providerUserId,
        },
      },
    });
    if (existing && existing.userId !== userId) {
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_ACCOUNT_ALREADY_LINKED,
        message: 'This provider account is already linked to another user',
        status: 409,
      });
    }

    const alreadyLinkedSameProvider = await this.prisma.oAuthAccount.findUnique({
      where: { userId_provider: { userId, provider: profile.provider } },
    });
    if (alreadyLinkedSameProvider) {
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_ACCOUNT_ALREADY_LINKED,
        message: `A ${profile.provider} account is already linked`,
        status: 409,
      });
    }

    await this.createLinkedAccount(userId, profile, tokens);

    await this.auditService.record({
      action: AuditAction.OAUTH_ACCOUNT_LINKED,
      resource: AuditResource.OAUTH_ACCOUNT,
      resourceId: userId,
      actor: { userId, email: user.email },
      metadata: { provider: profile.provider },
    });
  }

  async unlinkAccount(userId: string, provider: OAuthProvider): Promise<void> {
    const account = await this.prisma.oAuthAccount.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!account) {
      throw new NotFoundAppException('Linked account not found');
    }

    await this.ensureNotLastAuthMethod(userId, provider);

    await this.prisma.oAuthAccount.delete({ where: { id: account.id } });
    await this.auditService.record({
      action: AuditAction.OAUTH_ACCOUNT_UNLINKED,
      resource: AuditResource.OAUTH_ACCOUNT,
      resourceId: userId,
      actor: { userId },
      metadata: { provider },
    });
  }

  async listAccounts(
    userId: string,
  ): Promise<Array<{ provider: OAuthProvider; email: string | null; linkedAt: Date }>> {
    const accounts = await this.prisma.oAuthAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map((a) => ({ provider: a.provider, email: a.email, linkedAt: a.createdAt }));
  }

  private async ensureNotLastAuthMethod(userId: string, provider: OAuthProvider): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const hasUsablePassword =
      Boolean(user.passwordHash) && !user.passwordHash.startsWith('!oauth:');
    const otherProviders = await this.prisma.oAuthAccount.count({
      where: { userId, provider: { not: provider } },
    });
    if (!hasUsablePassword && otherProviders === 0) {
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_LAST_AUTH_METHOD,
        message: 'Cannot unlink the last remaining authentication method',
        status: 400,
      });
    }
  }

  private async createUserFromProfile(
    profile: NormalizedOAuthProfile,
    email: string,
  ): Promise<User> {
    // OAuth-only users get a random unusable password marker.
    const randomPassword = `!oauth:${randomBytes(24).toString('hex')}`;
    const passwordHash = await this.passwordService.hash(randomPassword);
    return this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: profile.firstName,
        lastName: profile.lastName,
        isEmailVerified: profile.emailVerified,
        status: UserStatus.ACTIVE,
      },
    });
  }

  private async createLinkedAccount(
    userId: string,
    profile: NormalizedOAuthProfile,
    tokens: OAuthTokenSet,
  ): Promise<void> {
    await this.prisma.oAuthAccount.create({
      data: {
        userId,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
        accessTokenEncrypted: this.encryptToken(tokens.accessToken),
        refreshTokenEncrypted: this.encryptToken(tokens.refreshToken),
        metadata: this.buildMetadata(profile),
      },
    });
  }

  private async persistTokens(
    accountId: string,
    tokens: OAuthTokenSet,
    profile: NormalizedOAuthProfile,
  ): Promise<void> {
    await this.prisma.oAuthAccount.update({
      where: { id: accountId },
      data: {
        email: profile.email,
        accessTokenEncrypted: this.encryptToken(tokens.accessToken),
        refreshTokenEncrypted: this.encryptToken(tokens.refreshToken),
        metadata: this.buildMetadata(profile),
      },
    });
  }

  private encryptToken(token?: string): string | null {
    if (!token) {
      return null;
    }
    return this.secretsCrypto.encrypt(token);
  }

  private buildMetadata(profile: NormalizedOAuthProfile): Prisma.InputJsonValue {
    return {
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      emailVerified: profile.emailVerified,
    };
  }
}
