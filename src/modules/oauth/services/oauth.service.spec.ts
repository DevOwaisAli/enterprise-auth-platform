import { OAuthProvider } from '@prisma/client';

import { OAUTH_ERROR_CODES } from '../constants';
import { type NormalizedOAuthProfile } from '../interfaces';

import { OAuthService } from './oauth.service';

type AnyMock = jest.Mock;

function profile(overrides: Partial<NormalizedOAuthProfile> = {}): NormalizedOAuthProfile {
  return {
    provider: OAuthProvider.GOOGLE,
    providerUserId: 'g-123',
    email: 'user@example.com',
    emailVerified: true,
    firstName: 'Jane',
    lastName: 'Doe',
    displayName: 'Jane Doe',
    avatarUrl: null,
    raw: {},
    ...overrides,
  };
}

describe('OAuthService', () => {
  let service: OAuthService;
  let prisma: {
    oAuthAccount: {
      findUnique: AnyMock;
      create: AnyMock;
      update: AnyMock;
      delete: AnyMock;
      count: AnyMock;
      findMany: AnyMock;
    };
    user: { findUnique: AnyMock; findUniqueOrThrow: AnyMock; create: AnyMock; update: AnyMock };
    $transaction: AnyMock;
  };
  let sessions: { createSession: AnyMock };
  let tokens: { signAccessToken: AnyMock };
  let activeContext: { resolveDefault: AnyMock };
  let passwords: { hash: AnyMock };
  let crypto: { encrypt: AnyMock };
  let audit: { record: AnyMock };

  beforeEach(() => {
    prisma = {
      oAuthAccount: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    sessions = { createSession: jest.fn() };
    tokens = { signAccessToken: jest.fn() };
    activeContext = { resolveDefault: jest.fn() };
    passwords = { hash: jest.fn() };
    crypto = { encrypt: jest.fn((v: string) => `enc(${v})`) };
    audit = { record: jest.fn() };

    service = new OAuthService(
      prisma as never,
      sessions as never,
      tokens as never,
      activeContext as never,
      passwords as never,
      crypto as never,
      audit as never,
    );
  });

  function mockSuccessfulSession(): void {
    sessions.createSession.mockResolvedValue({
      session: { id: 's1' },
      refreshToken: 'rt',
      refreshTokenExpiresAt: new Date(Date.now() + 60_000),
    });
    activeContext.resolveDefault.mockResolvedValue({
      organizationId: null,
      membershipId: null,
      roles: [],
      permissionsVersion: 0,
      attributesVersion: 0,
    });
    tokens.signAccessToken.mockResolvedValue('at');
  }

  it('creates a new user when no account or email match exists', async () => {
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    passwords.hash.mockResolvedValue('hash');
    prisma.user.create.mockResolvedValue({
      id: 'u-new',
      email: 'user@example.com',
      passwordHash: 'hash',
      status: 'ACTIVE',
      tokenVersion: 0,
      deletedAt: null,
    });
    mockSuccessfulSession();

    const result = await service.loginOrSignup(profile(), { accessToken: 'gat' }, {});

    expect(result.isNewUser).toBe(true);
    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.oAuthAccount.create).toHaveBeenCalled();
  });

  it('merges with an existing user by email (same-email merge)', async () => {
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-existing',
      email: 'user@example.com',
      passwordHash: 'hash',
      status: 'ACTIVE',
      tokenVersion: 0,
      deletedAt: null,
    });
    mockSuccessfulSession();

    const result = await service.loginOrSignup(profile(), { accessToken: 'gat' }, {});

    expect(result.isNewUser).toBe(false);
    expect(prisma.oAuthAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u-existing' }) }),
    );
  });

  it('rejects profiles without an email', async () => {
    await expect(
      service.loginOrSignup(profile({ email: null }), { accessToken: 'x' }, {}),
    ).rejects.toMatchObject({ code: OAUTH_ERROR_CODES.OAUTH_PROFILE_INCOMPLETE });
  });

  it('prevents unlinking the last auth method', async () => {
    prisma.oAuthAccount.findUnique.mockResolvedValue({ id: 'a1', userId: 'u1' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', passwordHash: '!oauth:xyz' });
    prisma.oAuthAccount.count.mockResolvedValue(0);

    await expect(service.unlinkAccount('u1', OAuthProvider.GOOGLE)).rejects.toMatchObject({
      code: OAUTH_ERROR_CODES.OAUTH_LAST_AUTH_METHOD,
    });
  });

  it('allows unlinking when a usable password remains', async () => {
    prisma.oAuthAccount.findUnique.mockResolvedValue({ id: 'a1', userId: 'u1' });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'u1', passwordHash: 'real-bcrypt-hash' });
    prisma.oAuthAccount.count.mockResolvedValue(0);

    await service.unlinkAccount('u1', OAuthProvider.GOOGLE);
    expect(prisma.oAuthAccount.delete).toHaveBeenCalled();
  });
});
