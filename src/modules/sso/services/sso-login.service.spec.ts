import { type ConfigService } from '@nestjs/config';

import { FEDERATION_CONFIG_KEY } from '@config/federation.config';

import { SSO_ERROR_CODES } from '../constants';

import { SsoLoginService } from './sso-login.service';

type AnyMock = jest.Mock;

describe('SsoLoginService', () => {
  let service: SsoLoginService;
  let ssoConfig: { getEnabledConfigForOrgSlug: AnyMock };
  let saml: { validateResponse: AnyMock; buildLoginUrl: AnyMock };
  let jit: { provision: AnyMock };
  let sessions: { createSession: AnyMock };
  let tokens: { signAccessToken: AnyMock };
  let activeContext: { resolveForOrganization: AnyMock; resolveDefault: AnyMock };
  let audit: { record: AnyMock };
  let cache: { set: AnyMock; get: AnyMock; exists: AnyMock; delete: AnyMock };

  const baseConfig = {
    id: 'cfg1',
    allowIdpInitiated: false,
    attributeMapping: {},
    defaultRoleSlug: 'member',
  };

  beforeEach(() => {
    ssoConfig = { getEnabledConfigForOrgSlug: jest.fn() };
    saml = { validateResponse: jest.fn(), buildLoginUrl: jest.fn() };
    jit = { provision: jest.fn() };
    sessions = { createSession: jest.fn() };
    tokens = { signAccessToken: jest.fn() };
    activeContext = { resolveForOrganization: jest.fn(), resolveDefault: jest.fn() };
    audit = { record: jest.fn() };
    cache = { set: jest.fn(), get: jest.fn(), exists: jest.fn(), delete: jest.fn() };

    const config = {
      getOrThrow: (key: string) =>
        key === FEDERATION_CONFIG_KEY
          ? { oauthStateTtlMs: 600000, saml: { replayCacheTtlMs: 3600000, entityId: 'sp' } }
          : {},
    } as unknown as ConfigService;

    service = new SsoLoginService(
      ssoConfig as never,
      saml as never,
      jit as never,
      sessions as never,
      tokens as never,
      activeContext as never,
      audit as never,
      cache as never,
      config,
    );
  });

  function mockHappyValidation(): void {
    ssoConfig.getEnabledConfigForOrgSlug.mockResolvedValue({
      config: baseConfig,
      organizationId: 'org1',
    });
    saml.validateResponse.mockResolvedValue({
      profile: { nameID: 'user@example.com', email: 'user@example.com' },
      assertionId: 'assertion-1',
    });
    jit.provision.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      passwordHash: 'h',
      tokenVersion: 0,
    });
    sessions.createSession.mockResolvedValue({
      session: { id: 's1' },
      refreshToken: 'rt',
      refreshTokenExpiresAt: new Date(Date.now() + 60_000),
    });
    activeContext.resolveForOrganization.mockResolvedValue({
      organizationId: 'org1',
      membershipId: 'm1',
      roles: ['member'],
      permissionsVersion: 1,
      attributesVersion: 1,
    });
    tokens.signAccessToken.mockResolvedValue('at');
  }

  it('completes SP-initiated login and issues tokens', async () => {
    mockHappyValidation();
    cache.exists.mockResolvedValueOnce(true); // relay state known
    cache.exists.mockResolvedValueOnce(false); // not a replay

    const result = await service.handleAssertion('acme', 'samlresp', 'relay-1', {});
    expect(result.tokens.accessToken).toBe('at');
    expect(result.sessionId).toBe('s1');
  });

  it('blocks IdP-initiated login when not allowed', async () => {
    ssoConfig.getEnabledConfigForOrgSlug.mockResolvedValue({
      config: baseConfig,
      organizationId: 'org1',
    });
    cache.exists.mockResolvedValue(false); // unknown relay state => IdP-initiated

    await expect(service.handleAssertion('acme', 'samlresp', undefined, {})).rejects.toMatchObject({
      code: SSO_ERROR_CODES.SSO_IDP_INITIATED_DISABLED,
    });
  });

  it('detects assertion replay', async () => {
    mockHappyValidation();
    cache.exists.mockResolvedValueOnce(true); // relay known
    cache.exists.mockResolvedValueOnce(true); // replay detected

    await expect(service.handleAssertion('acme', 'samlresp', 'relay-1', {})).rejects.toMatchObject({
      code: SSO_ERROR_CODES.SSO_REPLAY_DETECTED,
    });
  });

  it('rejects assertions missing an email', async () => {
    ssoConfig.getEnabledConfigForOrgSlug.mockResolvedValue({
      config: baseConfig,
      organizationId: 'org1',
    });
    cache.exists.mockResolvedValueOnce(true); // relay known
    cache.exists.mockResolvedValueOnce(false); // not replay
    saml.validateResponse.mockResolvedValue({
      profile: { nameID: 'no-email-here' },
      assertionId: 'a2',
    });

    await expect(service.handleAssertion('acme', 'samlresp', 'relay-1', {})).rejects.toMatchObject({
      code: SSO_ERROR_CODES.SSO_EMAIL_MISSING,
    });
  });
});
