import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthProvider } from '@prisma/client';

import { FEDERATION_CONFIG_KEY, type FederationConfig } from '@config/federation.config';

import { type NormalizedOAuthProfile } from '../interfaces';

import { BaseOAuthStrategy } from './base-oauth.strategy';

interface MicrosoftUser {
  id: string;
  mail?: string | null;
  userPrincipalName?: string;
  givenName?: string | null;
  surname?: string | null;
  displayName?: string | null;
}

@Injectable()
export class MicrosoftOAuthStrategy extends BaseOAuthStrategy {
  readonly provider = OAuthProvider.MICROSOFT;

  constructor(configService: ConfigService) {
    const config = configService.getOrThrow<FederationConfig>(FEDERATION_CONFIG_KEY);
    const tenant = config.microsoft.tenantId || 'common';
    super(
      {
        clientId: config.microsoft.clientId,
        clientSecret: config.microsoft.clientSecret,
        callbackUrl: config.microsoft.callbackUrl,
      },
      {
        authorizationUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        scope: 'openid email profile User.Read offline_access',
      },
    );
  }

  protected async fetchProfile(accessToken: string): Promise<NormalizedOAuthProfile> {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`Microsoft Graph request failed: ${response.status}`);
    }
    const user = (await response.json()) as MicrosoftUser;
    const email = user.mail ?? user.userPrincipalName ?? null;
    return {
      provider: this.provider,
      providerUserId: user.id,
      email,
      // Azure AD verifies organizational accounts; treat returned email as verified.
      emailVerified: Boolean(email),
      firstName: user.givenName ?? null,
      lastName: user.surname ?? null,
      displayName: user.displayName ?? null,
      avatarUrl: null,
      raw: user as unknown as Record<string, unknown>,
    };
  }
}
