import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthProvider } from '@prisma/client';

import { FEDERATION_CONFIG_KEY, type FederationConfig } from '@config/federation.config';

import { type NormalizedOAuthProfile } from '../interfaces';

import { BaseOAuthStrategy } from './base-oauth.strategy';

interface GitHubUser {
  id: number;
  login: string;
  name?: string | null;
  avatar_url?: string;
  email?: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

@Injectable()
export class GitHubOAuthStrategy extends BaseOAuthStrategy {
  readonly provider = OAuthProvider.GITHUB;

  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<FederationConfig>(FEDERATION_CONFIG_KEY);
    super(
      {
        clientId: config.github.clientId,
        clientSecret: config.github.clientSecret,
        callbackUrl: config.github.callbackUrl,
      },
      {
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scope: 'read:user user:email',
      },
    );
  }

  protected async fetchProfile(accessToken: string): Promise<NormalizedOAuthProfile> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'enterprise-auth-platform',
    };
    const userResponse = await fetch('https://api.github.com/user', { headers });
    if (!userResponse.ok) {
      throw new Error(`GitHub user request failed: ${userResponse.status}`);
    }
    const user = (await userResponse.json()) as GitHubUser;

    let email = user.email ?? null;
    let emailVerified = false;
    const emailResponse = await fetch('https://api.github.com/user/emails', { headers });
    if (emailResponse.ok) {
      const emails = (await emailResponse.json()) as GitHubEmail[];
      const primary = emails.find((e) => e.primary) ?? emails.find((e) => e.verified);
      if (primary) {
        email = primary.email;
        emailVerified = primary.verified;
      }
    }

    const [firstName, ...rest] = (user.name ?? '').trim().split(/\s+/);
    return {
      provider: this.provider,
      providerUserId: String(user.id),
      email,
      emailVerified,
      firstName: firstName || null,
      lastName: rest.length > 0 ? rest.join(' ') : null,
      displayName: user.name ?? user.login,
      avatarUrl: user.avatar_url ?? null,
      raw: user as unknown as Record<string, unknown>,
    };
  }
}
