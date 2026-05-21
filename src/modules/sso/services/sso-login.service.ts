import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type User } from '@prisma/client';

import { AppException } from '@common/exceptions';
import { FEDERATION_CONFIG_KEY, type FederationConfig } from '@config/federation.config';
import { CacheService } from '@infrastructure/cache';
import { AuditAction, AuditResource, AuditService } from '@modules/audit';
import { type LoginMetadata, type TokenPair } from '@modules/auth/interfaces';
import { ActiveContextService } from '@modules/auth/services/active-context.service';
import { SessionService } from '@modules/auth/services/session.service';
import { TokenService } from '@modules/auth/services/token.service';

import { SSO_CACHE_KEYS, SSO_ERROR_CODES, SSO_RELAY_STATE_BYTES } from '../constants';
import { mapSamlAttributes } from '../utils';

import { JitProvisioningService } from './jit-provisioning.service';
import { SamlProviderService } from './saml-provider.service';
import { SsoConfigurationService } from './sso-configuration.service';

export interface SsoLoginResult {
  user: Omit<User, 'passwordHash'>;
  tokens: TokenPair;
  sessionId: string;
}

@Injectable()
export class SsoLoginService {
  private readonly federationConfig: FederationConfig;

  constructor(
    private readonly ssoConfigService: SsoConfigurationService,
    private readonly samlProvider: SamlProviderService,
    private readonly jitProvisioning: JitProvisioningService,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
    private readonly activeContextService: ActiveContextService,
    private readonly auditService: AuditService,
    private readonly cache: CacheService,
    configService: ConfigService,
  ) {
    this.federationConfig = configService.getOrThrow<FederationConfig>(FEDERATION_CONFIG_KEY);
  }

  async beginSpInitiatedLogin(organizationSlug: string): Promise<string> {
    const { config } = await this.ssoConfigService.getEnabledConfigForOrgSlug(organizationSlug);
    const relayState = randomBytes(SSO_RELAY_STATE_BYTES).toString('hex');
    await this.cache.set(
      SSO_CACHE_KEYS.relayState(relayState),
      { organizationSlug },
      {
        ttlSeconds: Math.floor(this.federationConfig.oauthStateTtlMs / 1000),
      },
    );
    return this.samlProvider.buildLoginUrl(config, organizationSlug, relayState);
  }

  async handleAssertion(
    organizationSlug: string,
    samlResponse: string,
    relayState: string | undefined,
    metadata: LoginMetadata,
  ): Promise<SsoLoginResult> {
    const { config, organizationId } =
      await this.ssoConfigService.getEnabledConfigForOrgSlug(organizationSlug);

    const isIdpInitiated = !relayState || !(await this.isKnownRelayState(relayState));
    if (isIdpInitiated && !config.allowIdpInitiated) {
      await this.recordFailure(organizationId, organizationSlug, 'idp_initiated_disabled');
      throw new AppException({
        code: SSO_ERROR_CODES.SSO_IDP_INITIATED_DISABLED,
        message: 'IdP-initiated SSO is not allowed for this organization',
        status: 403,
      });
    }
    if (relayState) {
      await this.cache.delete(SSO_CACHE_KEYS.relayState(relayState));
    }

    const { profile, assertionId } = await this.samlProvider.validateResponse(
      config,
      organizationSlug,
      samlResponse,
      relayState,
    );

    await this.guardReplay(assertionId, organizationSlug, organizationId);

    const attrs = mapSamlAttributes(
      profile,
      (config.attributeMapping ?? {}) as Record<string, string>,
    );
    if (!attrs.email) {
      await this.recordFailure(organizationId, organizationSlug, 'email_missing');
      throw new AppException({
        code: SSO_ERROR_CODES.SSO_EMAIL_MISSING,
        message: 'SAML assertion did not include an email address',
        status: 400,
      });
    }

    const user = await this.jitProvisioning.provision(
      organizationId,
      attrs,
      config.defaultRoleSlug,
    );

    const created = await this.sessionService.createSession(user.id, metadata);
    const orgCtx = await this.activeContextService.resolveForOrganization(user.id, organizationId);
    const resolved = orgCtx ?? (await this.activeContextService.resolveDefault(user.id));

    const accessToken = await this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      sessionId: created.session.id,
      tokenVersion: user.tokenVersion,
      organizationId: resolved.organizationId,
      membershipId: resolved.membershipId,
      roles: resolved.roles,
      permissionsVersion: resolved.permissionsVersion,
      attributesVersion: resolved.attributesVersion,
    });

    await this.auditService.record({
      action: AuditAction.SSO_LOGIN_SUCCESS,
      resource: AuditResource.SSO_CONFIGURATION,
      resourceId: config.id,
      actor: { userId: user.id, email: user.email },
      metadata: { organizationId, idpInitiated: isIdpInitiated },
    });

    const { passwordHash: _ph, ...safeUser } = user;
    return {
      user: safeUser,
      sessionId: created.session.id,
      tokens: {
        accessToken,
        refreshToken: created.refreshToken,
        accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        refreshTokenExpiresAt: created.refreshTokenExpiresAt,
      },
    };
  }

  private async isKnownRelayState(relayState: string): Promise<boolean> {
    return this.cache.exists(SSO_CACHE_KEYS.relayState(relayState));
  }

  private async guardReplay(
    assertionId: string | null,
    organizationSlug: string,
    organizationId: string,
  ): Promise<void> {
    if (!assertionId) {
      return;
    }
    const key = SSO_CACHE_KEYS.assertionReplay(assertionId);
    const seen = await this.cache.exists(key);
    if (seen) {
      await this.recordFailure(organizationId, organizationSlug, 'replay_detected');
      throw new AppException({
        code: SSO_ERROR_CODES.SSO_REPLAY_DETECTED,
        message: 'SAML assertion replay detected',
        status: 401,
      });
    }
    await this.cache.set(
      key,
      { seenAt: Date.now() },
      {
        ttlSeconds: Math.floor(this.federationConfig.saml.replayCacheTtlMs / 1000),
      },
    );
  }

  private async recordFailure(
    organizationId: string,
    organizationSlug: string,
    reason: string,
  ): Promise<void> {
    await this.auditService.record({
      action: AuditAction.SSO_LOGIN_FAILURE,
      resource: AuditResource.SSO_CONFIGURATION,
      status: 'failure',
      metadata: { organizationId, organizationSlug, reason },
    });
  }
}
