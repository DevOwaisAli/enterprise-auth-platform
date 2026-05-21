import { type OAuthProvider } from '@prisma/client';

export interface NormalizedOAuthProfile {
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  raw: Record<string, unknown>;
}

export interface OAuthTokenSet {
  accessToken?: string;
  refreshToken?: string;
}

export interface OAuthCallbackResult {
  profile: NormalizedOAuthProfile;
  tokens: OAuthTokenSet;
}
