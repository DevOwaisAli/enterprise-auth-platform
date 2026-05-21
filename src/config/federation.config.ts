import { registerAs } from '@nestjs/config';

export const FEDERATION_CONFIG_KEY = 'federation';

export interface OAuthProviderClientConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export interface FederationConfig {
  encryptionKey: string;
  mfaIssuer: string;
  mfaChallengeTtlMs: number;
  mfaChallengeTokenBytes: number;
  mfaBackupCodeCount: number;
  mfaTotpWindow: number;
  oauthStateTtlMs: number;
  baseUrl: string;
  google: OAuthProviderClientConfig;
  github: OAuthProviderClientConfig;
  microsoft: OAuthProviderClientConfig & { tenantId: string };
  saml: {
    entityId: string;
    acsBaseUrl: string;
    clockSkewMs: number;
    replayCacheTtlMs: number;
  };
}

const DEFAULT_BASE_URL = process.env.APP_URL ?? 'http://localhost:3000';

export default registerAs<FederationConfig>(FEDERATION_CONFIG_KEY, () => ({
  encryptionKey: process.env.FEDERATION_ENCRYPTION_KEY ?? '',
  mfaIssuer: process.env.MFA_ISSUER ?? 'EnterpriseAuthPlatform',
  mfaChallengeTtlMs: Number(process.env.MFA_CHALLENGE_TTL_MS ?? 5 * 60 * 1000),
  mfaChallengeTokenBytes: Number(process.env.MFA_CHALLENGE_TOKEN_BYTES ?? 32),
  mfaBackupCodeCount: Number(process.env.MFA_BACKUP_CODE_COUNT ?? 10),
  mfaTotpWindow: Number(process.env.MFA_TOTP_WINDOW ?? 1),
  oauthStateTtlMs: Number(process.env.OAUTH_STATE_TTL_MS ?? 10 * 60 * 1000),
  baseUrl: DEFAULT_BASE_URL,
  google: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
    callbackUrl:
      process.env.GOOGLE_OAUTH_CALLBACK_URL ?? `${DEFAULT_BASE_URL}/api/v1/oauth/google/callback`,
  },
  github: {
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET ?? '',
    callbackUrl:
      process.env.GITHUB_OAUTH_CALLBACK_URL ?? `${DEFAULT_BASE_URL}/api/v1/oauth/github/callback`,
  },
  microsoft: {
    clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET ?? '',
    callbackUrl:
      process.env.MICROSOFT_OAUTH_CALLBACK_URL ??
      `${DEFAULT_BASE_URL}/api/v1/oauth/microsoft/callback`,
    tenantId: process.env.MICROSOFT_OAUTH_TENANT_ID ?? 'common',
  },
  saml: {
    entityId: process.env.SAML_ENTITY_ID ?? 'urn:enterprise-auth-platform:sp',
    acsBaseUrl: process.env.SAML_ACS_BASE_URL ?? `${DEFAULT_BASE_URL}/api/v1/sso`,
    clockSkewMs: Number(process.env.SAML_CLOCK_SKEW_MS ?? 5 * 60 * 1000),
    replayCacheTtlMs: Number(process.env.SAML_REPLAY_CACHE_TTL_MS ?? 60 * 60 * 1000),
  },
}));
