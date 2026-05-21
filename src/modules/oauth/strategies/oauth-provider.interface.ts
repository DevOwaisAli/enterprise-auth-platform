import { type OAuthProvider } from '@prisma/client';

import { type NormalizedOAuthProfile, type OAuthTokenSet } from '../interfaces';

export interface AuthorizationUrlParams {
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

export interface ExchangeParams {
  code: string;
  codeVerifier: string;
}

export interface OAuthProviderStrategy {
  readonly provider: OAuthProvider;
  isConfigured(): boolean;
  buildAuthorizationUrl(params: AuthorizationUrlParams): string;
  exchangeCode(
    params: ExchangeParams,
  ): Promise<{ tokens: OAuthTokenSet; profile: NormalizedOAuthProfile }>;
}

export const OAUTH_PROVIDER_STRATEGIES = Symbol('OAUTH_PROVIDER_STRATEGIES');
