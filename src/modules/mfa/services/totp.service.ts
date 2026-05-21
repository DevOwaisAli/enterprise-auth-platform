import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as qrcode from 'qrcode';
import * as speakeasy from 'speakeasy';

import { FEDERATION_CONFIG_KEY, type FederationConfig } from '@config/federation.config';

import { MFA_CONSTANTS } from '../constants';

export interface TotpSecretWithUri {
  base32: string;
  otpauthUrl: string;
}

@Injectable()
export class TotpService {
  private readonly federationConfig: FederationConfig;

  constructor(configService: ConfigService) {
    this.federationConfig = configService.getOrThrow<FederationConfig>(FEDERATION_CONFIG_KEY);
  }

  generateSecret(accountLabel: string): TotpSecretWithUri {
    const secret = speakeasy.generateSecret({
      length: MFA_CONSTANTS.TOTP_SECRET_BYTES,
      name: `${this.federationConfig.mfaIssuer}:${accountLabel}`,
      issuer: this.federationConfig.mfaIssuer,
    });
    return {
      base32: secret.base32,
      otpauthUrl: secret.otpauth_url ?? '',
    };
  }

  verifyCode(secretBase32: string, code: string): boolean {
    if (!/^\d{6}$/.test(code.trim())) {
      return false;
    }
    return speakeasy.totp.verify({
      secret: secretBase32,
      encoding: 'base32',
      token: code.trim(),
      window: this.federationConfig.mfaTotpWindow,
      step: MFA_CONSTANTS.TOTP_STEP_SECONDS,
      digits: MFA_CONSTANTS.TOTP_DIGITS,
    });
  }

  async toQrCodeDataUrl(otpauthUrl: string): Promise<string> {
    return qrcode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'M', margin: 2 });
  }
}
