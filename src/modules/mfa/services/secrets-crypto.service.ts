import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FEDERATION_CONFIG_KEY, type FederationConfig } from '@config/federation.config';

import { decryptAesGcm, encryptAesGcm } from '../utils';

@Injectable()
export class SecretsCryptoService {
  private readonly federationConfig: FederationConfig;

  constructor(configService: ConfigService) {
    this.federationConfig = configService.getOrThrow<FederationConfig>(FEDERATION_CONFIG_KEY);
  }

  encrypt(plaintext: string): string {
    return encryptAesGcm(plaintext, { encryptionKey: this.federationConfig.encryptionKey });
  }

  decrypt(ciphertext: string): string {
    return decryptAesGcm(ciphertext, { encryptionKey: this.federationConfig.encryptionKey });
  }
}
