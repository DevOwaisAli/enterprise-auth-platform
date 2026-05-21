import { Injectable } from '@nestjs/common';
import { type OAuthProvider } from '@prisma/client';

import { type LoginMetadata } from '@modules/auth/interfaces';

import { OAuthProviderRegistry } from '../strategies';

import { OAuthStateService } from './oauth-state.service';
import { type OAuthLoginResult, OAuthService } from './oauth.service';

@Injectable()
export class OAuthFlowService {
  constructor(
    private readonly registry: OAuthProviderRegistry,
    private readonly stateService: OAuthStateService,
    private readonly oauthService: OAuthService,
  ) {}

  async beginLogin(provider: OAuthProvider, redirectTo?: string): Promise<string> {
    const strategy = this.registry.get(provider);
    const { state, codeChallenge, codeChallengeMethod } = await this.stateService.create({
      provider,
      mode: 'login',
      redirectTo,
    });
    return strategy.buildAuthorizationUrl({ state, codeChallenge, codeChallengeMethod });
  }

  async beginLink(provider: OAuthProvider, userId: string, redirectTo?: string): Promise<string> {
    const strategy = this.registry.get(provider);
    const { state, codeChallenge, codeChallengeMethod } = await this.stateService.create({
      provider,
      mode: 'link',
      linkUserId: userId,
      redirectTo,
    });
    return strategy.buildAuthorizationUrl({ state, codeChallenge, codeChallengeMethod });
  }

  async handleCallback(
    provider: OAuthProvider,
    code: string,
    state: string,
    metadata: LoginMetadata,
  ): Promise<{ result?: OAuthLoginResult; mode: 'login' | 'link'; redirectTo?: string }> {
    const stateData = await this.stateService.consume(state, provider);
    const strategy = this.registry.get(provider);
    const { profile, tokens } = await strategy.exchangeCode({
      code,
      codeVerifier: stateData.codeVerifier,
    });

    if (stateData.mode === 'link' && stateData.linkUserId) {
      await this.oauthService.linkAccount(stateData.linkUserId, profile, tokens);
      return { mode: 'link', redirectTo: stateData.redirectTo };
    }

    const result = await this.oauthService.loginOrSignup(profile, tokens, metadata);
    return { result, mode: 'login', redirectTo: stateData.redirectTo };
  }
}
