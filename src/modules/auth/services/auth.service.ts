import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Prisma, type User, UserStatus } from '@prisma/client';

import { AppException } from '@common/exceptions';
import { RequestContext } from '@common/utils/request-context';
import { type AppConfig, APP_CONFIG_KEY } from '@config/app.config';
import { type AuthConfig, AUTH_CONFIG_KEY } from '@config/auth.config';
import { PrismaService } from '@infrastructure/database';
import {
  MailJobType,
  type PasswordChangedJobData,
  type ResetPasswordJobData,
  type VerifyEmailJobData,
} from '@infrastructure/mail';
import { QUEUE_NAMES, QueueService } from '@infrastructure/queue';
import { AuditAction, AuditResource, AuditService } from '@modules/audit';

import { AUTH_ERROR_CODES } from '../constants';
import { type JwtAccessPayload, type LoginMetadata, type TokenPair } from '../interfaces';

import { ActiveContextService } from './active-context.service';
import { LoginHooksService, type MfaChallengeRequired } from './login-hooks.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { VerificationService } from './verification.service';

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface RegisterResult {
  user: SafeUser;
  emailVerificationToken: string;
  emailVerificationExpiresAt: Date;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  user: SafeUser;
  tokens: TokenPair;
  sessionId: string;
}

export type LoginOutcome = LoginResult | MfaChallengeRequired;

export type SafeUser = Omit<User, 'passwordHash'>;

export interface ChangePasswordInput {
  userId: string;
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions: boolean;
  currentSessionId: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

@Injectable()
export class AuthService {
  private readonly authConfig: AuthConfig;
  private readonly appConfig: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly verificationService: VerificationService,
    private readonly auditService: AuditService,
    private readonly queueService: QueueService,
    private readonly activeContextService: ActiveContextService,
    private readonly loginHooks: LoginHooksService,
    configService: ConfigService,
  ) {
    this.authConfig = configService.getOrThrow<AuthConfig>(AUTH_CONFIG_KEY);
    this.appConfig = configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);
  }

  async register(input: RegisterInput): Promise<RegisterResult> {
    const normalizedEmail = input.email.trim().toLowerCase();
    this.passwordService.enforcePolicy(input.password);

    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new AppException({
        code: AUTH_ERROR_CODES.EMAIL_ALREADY_REGISTERED,
        message: 'Email is already registered',
        status: 409,
      });
    }

    const passwordHash = await this.passwordService.hash(input.password);

    const { user, verificationToken } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
        },
      });
      await tx.passwordHistory.create({
        data: { userId: created.id, passwordHash },
      });
      const issued = await this.verificationService.issueEmailVerificationToken(created.id, tx);
      return { user: created, verificationToken: issued };
    });

    await this.auditService.record({
      action: AuditAction.TOKEN_ISSUED,
      resource: AuditResource.USER,
      resourceId: user.id,
      metadata: { kind: 'email_verification' },
    });

    await this.enqueueVerifyEmail(user, verificationToken.rawToken, verificationToken.expiresAt);

    return {
      user: this.stripSecrets(user),
      emailVerificationToken: verificationToken.rawToken,
      emailVerificationExpiresAt: verificationToken.expiresAt,
    };
  }

  async verifyEmail(token: string): Promise<{ userId: string }> {
    return this.verificationService.consumeEmailVerificationToken(token);
  }

  async login(input: LoginInput, metadata: LoginMetadata): Promise<LoginOutcome> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || user.deletedAt) {
      throw this.invalidCredentials();
    }

    if (user.status === UserStatus.LOCKED || this.isLocked(user)) {
      throw new AppException({
        code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
        message: 'Account is temporarily locked. Try again later.',
        status: 423,
      });
    }

    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.SUSPENDED) {
      throw new AppException({
        code: AUTH_ERROR_CODES.ACCOUNT_INACTIVE,
        message: 'Account is not active',
        status: 403,
      });
    }

    const ssoCheck = await this.loginHooks.checkSsoEnforcement(user);
    if (ssoCheck.blocked) {
      await this.auditService.record({
        action: AuditAction.LOGIN_FAILURE,
        resource: AuditResource.USER,
        resourceId: user.id,
        status: 'failure',
        actor: { userId: user.id, email: user.email },
        metadata: { reason: ssoCheck.reason ?? 'sso_only_enforced' },
      });
      throw new AppException({
        code: 'SSO_ONLY_ENFORCED',
        message:
          ssoCheck.reason ??
          'Your organization requires SSO login. Please use the SSO portal to sign in.',
        status: 403,
      });
    }

    const matches = await this.passwordService.compare(input.password, user.passwordHash);
    if (!matches) {
      await this.handleFailedLogin(user);
      throw this.invalidCredentials();
    }

    const mfaChallenge = await this.loginHooks.checkMfa(user, metadata);
    if (mfaChallenge) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockUntil: null },
      });
      return mfaChallenge;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: 0,
          lockUntil: null,
          lastLoginAt: new Date(),
        },
      });
      return this.sessionService.createSession(user.id, metadata, tx);
    });

    const orgCtx = await this.activeContextService.resolveDefault(user.id);
    const accessToken = await this.tokenService.signAccessToken(
      this.buildAccessPayload(user, created.session.id, orgCtx),
    );

    await this.auditService.record({
      action: AuditAction.LOGIN_SUCCESS,
      resource: AuditResource.SESSION,
      resourceId: created.session.id,
      actor: { userId: user.id, email: user.email },
    });

    return {
      user: this.stripSecrets(user),
      sessionId: created.session.id,
      tokens: {
        accessToken,
        refreshToken: created.refreshToken,
        accessTokenExpiresAt: this.computeAccessTokenExpiry(),
        refreshTokenExpiresAt: created.refreshTokenExpiresAt,
      },
    };
  }

  async refresh(refreshToken: string, metadata: LoginMetadata): Promise<TokenPair> {
    const rotated = await this.sessionService.rotateRefreshToken(refreshToken, metadata);
    const user = await this.prisma.user.findUnique({ where: { id: rotated.session.userId } });
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new AppException({
        code: AUTH_ERROR_CODES.ACCOUNT_INACTIVE,
        message: 'Account is not active',
        status: 403,
      });
    }

    const orgCtx = await this.activeContextService.resolveDefault(user.id);
    const accessToken = await this.tokenService.signAccessToken(
      this.buildAccessPayload(user, rotated.session.id, orgCtx),
    );

    return {
      accessToken,
      refreshToken: rotated.refreshToken,
      accessTokenExpiresAt: this.computeAccessTokenExpiry(),
      refreshTokenExpiresAt: rotated.refreshTokenExpiresAt,
    };
  }

  async switchOrganization(
    userId: string,
    sessionId: string,
    organizationId: string,
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      throw new AppException({
        code: AUTH_ERROR_CODES.ACCOUNT_INACTIVE,
        message: 'Account is not active',
        status: 403,
      });
    }
    const orgCtx = await this.activeContextService.resolveForOrganization(userId, organizationId);
    if (!orgCtx) {
      throw new AppException({
        code: AUTH_ERROR_CODES.ORG_MEMBERSHIP_NOT_FOUND,
        message: 'Active membership not found for organization',
        status: 403,
      });
    }
    const accessToken = await this.tokenService.signAccessToken(
      this.buildAccessPayload(user, sessionId, orgCtx),
    );
    return { accessToken, expiresAt: this.computeAccessTokenExpiry() };
  }

  private buildAccessPayload(
    user: User,
    sessionId: string,
    orgCtx: {
      organizationId: string | null;
      membershipId: string | null;
      roles: string[];
      permissionsVersion: number;
      attributesVersion: number;
    },
  ): JwtAccessPayload {
    return {
      sub: user.id,
      email: user.email,
      sessionId,
      tokenVersion: user.tokenVersion,
      organizationId: orgCtx.organizationId,
      membershipId: orgCtx.membershipId,
      roles: orgCtx.roles,
      permissionsVersion: orgCtx.permissionsVersion,
      attributesVersion: orgCtx.attributesVersion,
    };
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await this.sessionService.revokeSession(sessionId, userId);
    await this.auditService.record({
      action: AuditAction.LOGOUT,
      resource: AuditResource.SESSION,
      resourceId: sessionId,
      actor: { userId },
    });
  }

  async logoutAll(userId: string, exceptSessionId?: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await this.sessionService.revokeAllSessionsForUser(userId, exceptSessionId);
    await this.auditService.record({
      action: AuditAction.LOGOUT,
      resource: AuditResource.SESSION,
      actor: { userId },
      metadata: { scope: 'all', exceptSessionId },
    });
  }

  async changePassword(input: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw this.invalidCredentials();
    }

    const matches = await this.passwordService.compare(input.currentPassword, user.passwordHash);
    if (!matches) {
      throw this.invalidCredentials();
    }

    this.passwordService.enforcePolicy(input.newPassword);
    await this.ensureNotRecentlyUsed(input.userId, input.newPassword);

    const newHash = await this.passwordService.hash(input.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });
      await tx.passwordHistory.create({ data: { userId: user.id, passwordHash: newHash } });
      await this.trimPasswordHistory(user.id, tx);
    });

    if (input.revokeOtherSessions) {
      await this.sessionService.revokeAllSessionsForUser(input.userId, input.currentSessionId);
    }

    await this.auditService.record({
      action: AuditAction.PASSWORD_CHANGED,
      resource: AuditResource.USER,
      resourceId: user.id,
      actor: { userId: user.id, email: user.email },
    });

    await this.enqueuePasswordChanged(user);
  }

  async requestPasswordReset(email: string): Promise<{ rawToken: string; expiresAt: Date } | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || user.deletedAt) {
      return null;
    }
    const issued = await this.verificationService.issuePasswordResetToken(user.id);
    await this.auditService.record({
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      resource: AuditResource.USER,
      resourceId: user.id,
      actor: { userId: user.id, email: user.email },
    });
    await this.enqueueResetPassword(user, issued.rawToken, issued.expiresAt);
    return issued;
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    this.passwordService.enforcePolicy(input.newPassword);
    const { userId } = await this.verificationService.consumePasswordResetToken(input.token);
    await this.ensureNotRecentlyUsed(userId, input.newPassword);

    const newHash = await this.passwordService.hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newHash, tokenVersion: { increment: 1 } },
      });
      await tx.passwordHistory.create({ data: { userId, passwordHash: newHash } });
      await this.trimPasswordHistory(userId, tx);
    });

    await this.sessionService.revokeAllSessionsForUser(userId);
    await this.auditService.record({
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      resource: AuditResource.USER,
      resourceId: userId,
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await this.enqueuePasswordChanged(user);
    }
  }

  async findActiveUserById(userId: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, status: UserStatus.ACTIVE },
    });
  }

  stripSecrets(user: User): SafeUser {
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  private invalidCredentials(): AppException {
    return new AppException({
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      message: 'Invalid email or password',
      status: 401,
    });
  }

  private isLocked(user: User): boolean {
    return user.lockUntil !== null && user.lockUntil.getTime() > Date.now();
  }

  private async handleFailedLogin(user: User): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= this.authConfig.maxLoginAttempts;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockUntil: shouldLock ? new Date(Date.now() + this.authConfig.lockDurationMs) : null,
        status: shouldLock ? UserStatus.LOCKED : user.status,
      },
    });
    await this.auditService.record({
      action: AuditAction.LOGIN_FAILURE,
      resource: AuditResource.USER,
      resourceId: user.id,
      status: 'failure',
      actor: { userId: user.id, email: user.email },
      metadata: { attempts, locked: shouldLock },
    });
  }

  private async ensureNotRecentlyUsed(userId: string, newPassword: string): Promise<void> {
    const limit = this.authConfig.passwordPolicy.historyLimit;
    if (limit <= 0) {
      return;
    }
    const history = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    for (const entry of history) {
      const matches = await this.passwordService.compare(newPassword, entry.passwordHash);
      if (matches) {
        throw new AppException({
          code: AUTH_ERROR_CODES.PASSWORD_RECENTLY_USED,
          message: `Password matches one of the last ${limit} passwords`,
          status: 400,
        });
      }
    }
  }

  private async trimPasswordHistory(userId: string, tx: Prisma.TransactionClient): Promise<void> {
    const limit = this.authConfig.passwordPolicy.historyLimit;
    if (limit <= 0) {
      return;
    }
    const old = await tx.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: limit,
      select: { id: true },
    });
    if (old.length === 0) {
      return;
    }
    await tx.passwordHistory.deleteMany({
      where: { id: { in: old.map((entry) => entry.id) } },
    });
  }

  private computeAccessTokenExpiry(): Date {
    return new Date(Date.now() + 15 * 60 * 1000);
  }

  private async enqueueVerifyEmail(user: User, rawToken: string, expiresAt: Date): Promise<void> {
    const payload: VerifyEmailJobData = {
      to: user.email,
      firstName: user.firstName,
      verifyUrl: `${this.appConfig.appUrl}/auth/verify-email?token=${encodeURIComponent(rawToken)}`,
      expiresAt: expiresAt.toISOString(),
    };
    await this.queueService.enqueue(QUEUE_NAMES.EMAIL, MailJobType.VERIFY_EMAIL, payload);
  }

  private async enqueueResetPassword(user: User, rawToken: string, expiresAt: Date): Promise<void> {
    const payload: ResetPasswordJobData = {
      to: user.email,
      firstName: user.firstName,
      resetUrl: `${this.appConfig.appUrl}/auth/reset-password?token=${encodeURIComponent(rawToken)}`,
      expiresAt: expiresAt.toISOString(),
    };
    await this.queueService.enqueue(QUEUE_NAMES.EMAIL, MailJobType.RESET_PASSWORD, payload);
  }

  private async enqueuePasswordChanged(user: User): Promise<void> {
    const ctx = RequestContext.get();
    const payload: PasswordChangedJobData = {
      to: user.email,
      firstName: user.firstName,
      ipAddress: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      changedAt: new Date().toISOString(),
    };
    await this.queueService.enqueue(QUEUE_NAMES.EMAIL, MailJobType.PASSWORD_CHANGED, payload);
  }
}
