import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { UserStatus } from '@prisma/client';

import { AppException } from '@common/exceptions';
import { type AppConfig, APP_CONFIG_KEY } from '@config/app.config';
import { type AuthConfig, AUTH_CONFIG_KEY } from '@config/auth.config';
import { PrismaService } from '@infrastructure/database';
import { QueueService } from '@infrastructure/queue';
import { AuditService } from '@modules/audit';

import { AUTH_ERROR_CODES } from '../constants';

import { ActiveContextService } from './active-context.service';
import { AuthService } from './auth.service';
import { LoginHooksService } from './login-hooks.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';
import { VerificationService } from './verification.service';

const baseAuthConfig: AuthConfig = {
  bcryptSaltRounds: 4,
  passwordPolicy: {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: true,
    historyLimit: 5,
  },
  maxLoginAttempts: 3,
  lockDurationMs: 1000,
  emailVerificationTokenTtlMs: 1000,
  passwordResetTokenTtlMs: 1000,
  sessionTtlMs: 1000,
  appUrl: 'http://localhost:3000',
};

const baseAppConfig: AppConfig = {
  nodeEnv: 'test',
  port: 3000,
  apiPrefix: 'api',
  apiDefaultVersion: '1',
  corsOrigin: '*',
  bodyLimit: '10mb',
  appUrl: 'http://localhost:3000',
  isProduction: false,
  isDevelopment: false,
  isTest: true,
  logLevel: 'silent',
  logPretty: false,
};

type Mock<T> = { [K in keyof T]: jest.Mock };

function makeMock<T>(keys: (keyof T)[]): Mock<T> {
  return keys.reduce<Mock<T>>((acc, key) => ({ ...acc, [key]: jest.fn() }), {} as Mock<T>);
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: Mock<{ findUnique: never; update: never }>; $transaction: jest.Mock };
  let password: Mock<PasswordService>;
  let tokens: Mock<TokenService>;
  let sessions: Mock<SessionService>;
  let verification: Mock<VerificationService>;
  let audit: Mock<AuditService>;
  let queue: Mock<QueueService>;
  let activeContext: Mock<ActiveContextService>;
  let loginHooks: Mock<LoginHooksService>;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    password = makeMock<PasswordService>(['hash', 'compare', 'enforcePolicy']);
    tokens = makeMock<TokenService>(['signAccessToken', 'verifyAccessToken']);
    sessions = makeMock<SessionService>([
      'createSession',
      'rotateRefreshToken',
      'revokeSession',
      'revokeAllSessionsForUser',
      'listActiveSessionsForUser',
      'findSessionById',
    ]);
    verification = makeMock<VerificationService>([
      'issueEmailVerificationToken',
      'consumeEmailVerificationToken',
      'issuePasswordResetToken',
      'consumePasswordResetToken',
    ]);
    audit = makeMock<AuditService>(['record']);
    queue = makeMock<QueueService>(['enqueue', 'getQueue', 'getCounts']);
    activeContext = makeMock<ActiveContextService>(['resolveDefault', 'resolveForOrganization']);
    activeContext.resolveDefault.mockResolvedValue({
      organizationId: null,
      membershipId: null,
      roles: [],
      permissionsVersion: 0,
      attributesVersion: 0,
    });
    loginHooks = makeMock<LoginHooksService>([
      'registerMfaHook',
      'registerSsoEnforcement',
      'checkSsoEnforcement',
      'checkMfa',
    ]);
    loginHooks.checkSsoEnforcement.mockResolvedValue({ blocked: false });
    loginHooks.checkMfa.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: PasswordService, useValue: password },
        { provide: TokenService, useValue: tokens },
        { provide: SessionService, useValue: sessions },
        { provide: VerificationService, useValue: verification },
        { provide: AuditService, useValue: audit },
        { provide: QueueService, useValue: queue },
        { provide: ActiveContextService, useValue: activeContext },
        { provide: LoginHooksService, useValue: loginHooks },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === AUTH_CONFIG_KEY) {
                return baseAuthConfig;
              }
              if (key === APP_CONFIG_KEY) {
                return baseAppConfig;
              }
              return {};
            },
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('rejects duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      await expect(
        service.register({ email: 'a@b.com', password: 'StrongPassword-1!' }),
      ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.EMAIL_ALREADY_REGISTERED });
    });

    it('hashes the password and issues a verification token', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      password.hash.mockResolvedValue('hashed');
      verification.issueEmailVerificationToken.mockResolvedValue({
        rawToken: 'rawverify',
        expiresAt: new Date(Date.now() + 1000),
      });
      const createdUser = {
        id: 'u1',
        email: 'a@b.com',
        passwordHash: 'hashed',
        firstName: null,
        lastName: null,
        status: UserStatus.ACTIVE,
        isEmailVerified: false,
        tokenVersion: 0,
        failedLoginAttempts: 0,
        lockUntil: null,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({
          user: { create: jest.fn().mockResolvedValue(createdUser) },
          passwordHistory: { create: jest.fn() },
        }),
      );

      const result = await service.register({
        email: 'A@B.com ',
        password: 'StrongPassword-1!',
      });
      expect(password.hash).toHaveBeenCalledWith('StrongPassword-1!');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.emailVerificationToken).toBe('rawverify');
    });
  });

  describe('login', () => {
    const baseUser = {
      id: 'u1',
      email: 'a@b.com',
      passwordHash: 'hashed',
      firstName: null,
      lastName: null,
      status: UserStatus.ACTIVE,
      isEmailVerified: true,
      tokenVersion: 0,
      failedLoginAttempts: 0,
      lockUntil: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('returns 401 on missing user without leaking which check failed', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'a@b.com', password: 'wrong' }, {}),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('locks the account after max attempts', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, failedLoginAttempts: 2 });
      password.compare.mockResolvedValue(false);
      await expect(
        service.login({ email: 'a@b.com', password: 'wrong' }, {}),
      ).rejects.toMatchObject({ code: AUTH_ERROR_CODES.INVALID_CREDENTIALS });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 3,
            status: UserStatus.LOCKED,
            lockUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('issues tokens and creates a session on success', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      password.compare.mockResolvedValue(true);
      sessions.createSession.mockResolvedValue({
        session: { id: 's1' },
        refreshToken: 'rt',
        refreshTokenRecord: {},
        refreshTokenExpiresAt: new Date(Date.now() + 60_000),
      });
      tokens.signAccessToken.mockResolvedValue('at');

      const result = await service.login(
        { email: 'a@b.com', password: 'pw' },
        { ipAddress: '1.1.1.1' },
      );

      if ('mfaRequired' in result) {
        throw new Error('expected token result, got MFA challenge');
      }
      expect(result.tokens.accessToken).toBe('at');
      expect(result.tokens.refreshToken).toBe('rt');
      expect(result.sessionId).toBe('s1');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('rejects suspended accounts', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, status: UserStatus.SUSPENDED });
      await expect(service.login({ email: 'a@b.com', password: 'pw' }, {})).rejects.toMatchObject({
        code: AUTH_ERROR_CODES.ACCOUNT_INACTIVE,
      });
    });
  });
});
