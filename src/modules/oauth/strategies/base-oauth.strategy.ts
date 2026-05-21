import { Logger } from '@nestjs/common';
import { type OAuthProvider } from '@prisma/client';

import { AppException } from '@common/exceptions';

import { OAUTH_ERROR_CODES } from '../constants';
import { type NormalizedOAuthProfile, type OAuthTokenSet } from '../interfaces';

import {
  type AuthorizationUrlParams,
  type ExchangeParams,
  type OAuthProviderStrategy,
} from './oauth-provider.interface';

export interface OAuthEndpoints {
  authorizationUrl: string;
  tokenUrl: string;
  scope: string;
}

export interface OAuthClientCredentials {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export abstract class BaseOAuthStrategy implements OAuthProviderStrategy {
  protected readonly logger: Logger;

  abstract readonly provider: OAuthProvider;

  protected constructor(
    protected readonly credentials: OAuthClientCredentials,
    protected readonly endpoints: OAuthEndpoints,
  ) {
    this.logger = new Logger(`${this.constructor.name}`);
  }

  isConfigured(): boolean {
    return Boolean(this.credentials.clientId && this.credentials.clientSecret);
  }

  buildAuthorizationUrl(params: AuthorizationUrlParams): string {
    this.ensureConfigured();
    const url = new URL(this.endpoints.authorizationUrl);
    url.searchParams.set('client_id', this.credentials.clientId);
    url.searchParams.set('redirect_uri', this.credentials.callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.endpoints.scope);
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', params.codeChallengeMethod);
    this.decorateAuthorizationUrl(url);
    return url.toString();
  }

  async exchangeCode(
    params: ExchangeParams,
  ): Promise<{ tokens: OAuthTokenSet; profile: NormalizedOAuthProfile }> {
    this.ensureConfigured();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: this.credentials.callbackUrl,
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      code_verifier: params.codeVerifier,
    });

    const response = await fetch(this.endpoints.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.warn(`Token exchange failed (${response.status}): ${text}`);
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_STATE_INVALID,
        message: 'Failed to exchange OAuth authorization code',
        status: 401,
      });
    }

    const tokenJson = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
    };
    const tokens: OAuthTokenSet = {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
    };
    if (!tokens.accessToken) {
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_STATE_INVALID,
        message: 'OAuth provider did not return an access token',
        status: 401,
      });
    }
    const profile = await this.fetchProfile(tokens.accessToken);
    return { tokens, profile };
  }

  protected ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_PROVIDER_NOT_CONFIGURED,
        message: `OAuth provider ${this.provider} is not configured`,
        status: 503,
      });
    }
  }

  protected decorateAuthorizationUrl(_url: URL): void {
    // Hook for providers that need extra query params (overridden as needed).
  }

  protected abstract fetchProfile(accessToken: string): Promise<NormalizedOAuthProfile>;
}
