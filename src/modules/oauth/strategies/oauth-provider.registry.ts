import { Injectable } from '@nestjs/common';
import { type OAuthProvider } from '@prisma/client';

import { AppException } from '@common/exceptions';

import { OAUTH_ERROR_CODES } from '../constants';

import { GitHubOAuthStrategy } from './github.strategy';
import { GoogleOAuthStrategy } from './google.strategy';
import { MicrosoftOAuthStrategy } from './microsoft.strategy';
import { type OAuthProviderStrategy } from './oauth-provider.interface';

@Injectable()
export class OAuthProviderRegistry {
  private readonly strategies = new Map<OAuthProvider, OAuthProviderStrategy>();

  constructor(
    google: GoogleOAuthStrategy,
    github: GitHubOAuthStrategy,
    microsoft: MicrosoftOAuthStrategy,
  ) {
    for (const strategy of [google, github, microsoft]) {
      this.strategies.set(strategy.provider, strategy);
    }
  }

  get(provider: OAuthProvider): OAuthProviderStrategy {
    const strategy = this.strategies.get(provider);
    if (!strategy) {
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_PROVIDER_NOT_CONFIGURED,
        message: `Unknown OAuth provider: ${provider}`,
        status: 404,
      });
    }
    return strategy;
  }
}
