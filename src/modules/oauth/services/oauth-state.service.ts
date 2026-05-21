import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type OAuthProvider } from '@prisma/client';

import { AppException } from '@common/exceptions';
import { FEDERATION_CONFIG_KEY, type FederationConfig } from '@config/federation.config';
import { CacheService } from '@infrastructure/cache';

import {
  OAUTH_CACHE_KEYS,
  OAUTH_ERROR_CODES,
  OAUTH_PKCE_VERIFIER_BYTES,
  OAUTH_STATE_BYTES,
} from '../constants';
import { generatePkcePair, generateState } from '../utils';

export interface OAuthStateData {
  provider: OAuthProvider;
  codeVerifier: string;
  mode: 'login' | 'link';
  linkUserId?: string;
  redirectTo?: string;
  createdAt: number;
}

export interface CreatedState {
  state: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

@Injectable()
export class OAuthStateService {
  private readonly federationConfig: FederationConfig;

  constructor(
    private readonly cache: CacheService,
    configService: ConfigService,
  ) {
    this.federationConfig = configService.getOrThrow<FederationConfig>(FEDERATION_CONFIG_KEY);
  }

  async create(params: {
    provider: OAuthProvider;
    mode: 'login' | 'link';
    linkUserId?: string;
    redirectTo?: string;
  }): Promise<CreatedState> {
    const state = generateState(OAUTH_STATE_BYTES);
    const pkce = generatePkcePair(OAUTH_PKCE_VERIFIER_BYTES);
    const data: OAuthStateData = {
      provider: params.provider,
      codeVerifier: pkce.codeVerifier,
      mode: params.mode,
      linkUserId: params.linkUserId,
      redirectTo: params.redirectTo,
      createdAt: Date.now(),
    };
    await this.cache.set(OAUTH_CACHE_KEYS.state(state), data, {
      ttlSeconds: Math.floor(this.federationConfig.oauthStateTtlMs / 1000),
    });
    return {
      state,
      codeChallenge: pkce.codeChallenge,
      codeChallengeMethod: pkce.codeChallengeMethod,
    };
  }

  async consume(state: string, provider: OAuthProvider): Promise<OAuthStateData> {
    if (!state) {
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_STATE_INVALID,
        message: 'Missing OAuth state',
        status: 400,
      });
    }
    const key = OAUTH_CACHE_KEYS.state(state);
    const data = await this.cache.get<OAuthStateData>(key);
    if (!data) {
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_STATE_INVALID,
        message: 'Invalid or expired OAuth state',
        status: 400,
      });
    }
    // single-use: delete immediately to prevent replay
    await this.cache.delete(key);
    if (data.provider !== provider) {
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_STATE_INVALID,
        message: 'OAuth state provider mismatch',
        status: 400,
      });
    }
    return data;
  }
}
