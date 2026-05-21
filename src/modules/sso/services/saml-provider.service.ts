import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SAML, type SamlConfig, type Profile } from '@node-saml/node-saml';
import { type SsoConfiguration } from '@prisma/client';

import { AppException } from '@common/exceptions';
import { FEDERATION_CONFIG_KEY, type FederationConfig } from '@config/federation.config';

import { SSO_ERROR_CODES } from '../constants';

export interface SamlValidationResult {
  profile: Profile;
  assertionId: string | null;
}

@Injectable()
export class SamlProviderService {
  private readonly federationConfig: FederationConfig;

  constructor(configService: ConfigService) {
    this.federationConfig = configService.getOrThrow<FederationConfig>(FEDERATION_CONFIG_KEY);
  }

  private buildClient(config: SsoConfiguration, organizationSlug: string): SAML {
    const callbackUrl = `${this.federationConfig.saml.acsBaseUrl}/${organizationSlug}/acs`;
    const samlConfig: SamlConfig = {
      entryPoint: config.entryPoint,
      idpCert: this.normalizeCert(config.certificate),
      idpIssuer: config.issuer,
      issuer: this.federationConfig.saml.entityId,
      callbackUrl,
      audience: this.federationConfig.saml.entityId,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: false,
      acceptedClockSkewMs: this.federationConfig.saml.clockSkewMs,
      validateInResponseTo: 'never' as never,
      disableRequestedAuthnContext: true,
    };
    return new SAML(samlConfig);
  }

  async buildLoginUrl(
    config: SsoConfiguration,
    organizationSlug: string,
    relayState: string,
  ): Promise<string> {
    const client = this.buildClient(config, organizationSlug);
    return client.getAuthorizeUrlAsync(relayState, undefined, {});
  }

  async validateResponse(
    config: SsoConfiguration,
    organizationSlug: string,
    samlResponse: string,
    relayState?: string,
  ): Promise<SamlValidationResult> {
    const client = this.buildClient(config, organizationSlug);
    try {
      const { profile } = await client.validatePostResponseAsync({
        SAMLResponse: samlResponse,
        ...(relayState ? { RelayState: relayState } : {}),
      });
      if (!profile) {
        throw new AppException({
          code: SSO_ERROR_CODES.SSO_INVALID_ASSERTION,
          message: 'SAML response did not contain a valid assertion',
          status: 401,
        });
      }
      return { profile, assertionId: this.extractAssertionId(profile) };
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException({
        code: SSO_ERROR_CODES.SSO_INVALID_ASSERTION,
        message: `SAML assertion validation failed: ${(error as Error).message}`,
        status: 401,
      });
    }
  }

  private extractAssertionId(profile: Profile): string | null {
    const id = profile.ID ?? profile.assertionId;
    return typeof id === 'string' ? id : null;
  }

  private normalizeCert(certificate: string): string {
    const trimmed = certificate.trim();
    if (trimmed.includes('BEGIN CERTIFICATE')) {
      return trimmed
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\s+/g, '');
    }
    return trimmed.replace(/\s+/g, '');
  }
}
