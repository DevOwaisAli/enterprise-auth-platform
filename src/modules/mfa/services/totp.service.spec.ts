import { type ConfigService } from '@nestjs/config';
import * as speakeasy from 'speakeasy';

import { FEDERATION_CONFIG_KEY } from '@config/federation.config';

import { TotpService } from './totp.service';

describe('TotpService', () => {
  let service: TotpService;

  beforeEach(() => {
    const config = {
      getOrThrow: (key: string) => {
        if (key === FEDERATION_CONFIG_KEY) {
          return { mfaIssuer: 'TestIssuer', mfaTotpWindow: 1 };
        }
        return {};
      },
    } as unknown as ConfigService;
    service = new TotpService(config);
  });

  it('generates a secret with an otpauth url', () => {
    const secret = service.generateSecret('user@example.com');
    expect(secret.base32).toBeTruthy();
    expect(secret.otpauthUrl).toContain('otpauth://totp/');
  });

  it('verifies a valid TOTP code', () => {
    const secret = service.generateSecret('user@example.com');
    const token = speakeasy.totp({ secret: secret.base32, encoding: 'base32' });
    expect(service.verifyCode(secret.base32, token)).toBe(true);
  });

  it('rejects an invalid TOTP code', () => {
    const secret = service.generateSecret('user@example.com');
    expect(service.verifyCode(secret.base32, '000000')).toBe(false);
  });

  it('rejects non-numeric input', () => {
    const secret = service.generateSecret('user@example.com');
    expect(service.verifyCode(secret.base32, 'abcdef')).toBe(false);
  });

  it('generates a QR code data url', async () => {
    const secret = service.generateSecret('user@example.com');
    const dataUrl = await service.toQrCodeDataUrl(secret.otpauthUrl);
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});
