import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthProvider } from '@prisma/client';

import { FEDERATION_CONFIG_KEY, type FederationConfig } from '@config/federation.config';

import { type NormalizedOAuthProfile } from '../interfaces';

import { BaseOAuthStrategy } from './base-oauth.strategy';

interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
}

@Injectable()
export class GoogleOAuthStrategy extends BaseOAuthStrategy {
  readonly provider = OAuthProvider.GOOGLE;

  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<FederationConfig>(FEDERATION_CONFIG_KEY);
    super(
      {
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackUrl: config.google.callbackUrl,
      },
      {
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: 'openid email profile',
      },
    );
  }

  protected override decorateAuthorizationUrl(url: URL): void {
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
  }

  protected async fetchProfile(accessToken: string): Promise<NormalizedOAuthProfile> {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Google userinfo request failed: ${response.status}`);
    }
    const info = (await response.json()) as GoogleUserInfo;
    return {
      provider: this.provider,
      providerUserId: info.sub,
      email: info.email ?? null,
      emailVerified: Boolean(info.email_verified),
      firstName: info.given_name ?? null,
      lastName: info.family_name ?? null,
      displayName: info.name ?? null,
      avatarUrl: info.picture ?? null,
      raw: info as unknown as Record<string, unknown>,
    };
  }
}
