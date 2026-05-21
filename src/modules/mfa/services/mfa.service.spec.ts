import { type ConfigService } from '@nestjs/config';

import { FEDERATION_CONFIG_KEY } from '@config/federation.config';

import { MFA_ERROR_CODES } from '../constants';
import { hashBackupCode } from '../utils';

import { MfaService } from './mfa.service';

type AnyMock = jest.Mock;

describe('MfaService', () => {
  let service: MfaService;
  let prisma: {
    user: { findUnique: AnyMock };
    mfaSecret: { findUnique: AnyMock; upsert: AnyMock; update: AnyMock; delete: AnyMock };
    backupCode: {
      findMany: AnyMock;
      findUnique: AnyMock;
      update: AnyMock;
      deleteMany: AnyMock;
      createMany: AnyMock;
    };
    $transaction: AnyMock;
  };
  let totp: { generateSecret: AnyMock; verifyCode: AnyMock; toQrCodeDataUrl: AnyMock };
  let crypto: { encrypt: AnyMock; decrypt: AnyMock };
  let passwords: { compare: AnyMock };
  let audit: { record: AnyMock };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      mfaSecret: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      backupCode: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn(async (arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (tx: unknown) => unknown)(prisma);
        }
        return arg;
      }),
    };
    totp = { generateSecret: jest.fn(), verifyCode: jest.fn(), toQrCodeDataUrl: jest.fn() };
    crypto = {
      encrypt: jest.fn((v: string) => `enc(${v})`),
      decrypt: jest.fn((v: string) => v.replace(/^enc\(|\)$/g, '')),
    };
    passwords = { compare: jest.fn() };
    audit = { record: jest.fn() };

    const config = {
      getOrThrow: (key: string) =>
        key === FEDERATION_CONFIG_KEY ? { mfaBackupCodeCount: 10 } : {},
    } as unknown as ConfigService;

    service = new MfaService(
      prisma as never,
      totp as never,
      crypto as never,
      passwords as never,
      audit as never,
      config,
    );
  });

  describe('setup', () => {
    it('initializes a secret and returns QR code', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      prisma.mfaSecret.findUnique.mockResolvedValue(null);
      totp.generateSecret.mockReturnValue({ base32: 'SECRET', otpauthUrl: 'otpauth://x' });
      totp.toQrCodeDataUrl.mockResolvedValue('data:image/png;base64,abc');

      const result = await service.setup('u1');

      expect(result.secret).toBe('SECRET');
      expect(result.qrCodeDataUrl).toContain('data:image/png');
      expect(prisma.mfaSecret.upsert).toHaveBeenCalled();
    });

    it('rejects setup when MFA already enabled', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      prisma.mfaSecret.findUnique.mockResolvedValue({ isEnabled: true });
      await expect(service.setup('u1')).rejects.toMatchObject({
        code: MFA_ERROR_CODES.MFA_ALREADY_ENABLED,
      });
    });
  });

  describe('verifySetup', () => {
    it('enables MFA and returns backup codes on valid code', async () => {
      prisma.mfaSecret.findUnique.mockResolvedValue({
        secretEncrypted: 'enc(SECRET)',
        isEnabled: false,
      });
      totp.verifyCode.mockReturnValue(true);

      const result = await service.verifySetup('u1', '123456');

      expect(result.codes).toHaveLength(10);
      expect(prisma.mfaSecret.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isEnabled: true }) }),
      );
    });

    it('rejects invalid TOTP code during setup', async () => {
      prisma.mfaSecret.findUnique.mockResolvedValue({
        secretEncrypted: 'enc(SECRET)',
        isEnabled: false,
      });
      totp.verifyCode.mockReturnValue(false);
      await expect(service.verifySetup('u1', '000000')).rejects.toMatchObject({
        code: MFA_ERROR_CODES.INVALID_MFA_CODE,
      });
    });
  });

  describe('consumeBackupCode', () => {
    it('consumes an unused backup code once', async () => {
      const code = 'ABCD-1234';
      prisma.backupCode.findUnique.mockResolvedValue({
        id: 'bc1',
        userId: 'u1',
        codeHash: hashBackupCode(code),
        usedAt: null,
      });
      const ok = await service.consumeBackupCode('u1', code);
      expect(ok).toBe(true);
      expect(prisma.backupCode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
      );
    });

    it('rejects an already-used backup code', async () => {
      prisma.backupCode.findUnique.mockResolvedValue({
        id: 'bc1',
        userId: 'u1',
        usedAt: new Date(),
      });
      expect(await service.consumeBackupCode('u1', 'ABCD-1234')).toBe(false);
    });

    it('rejects a backup code belonging to another user', async () => {
      prisma.backupCode.findUnique.mockResolvedValue({ id: 'bc1', userId: 'other', usedAt: null });
      expect(await service.consumeBackupCode('u1', 'ABCD-1234')).toBe(false);
    });
  });

  describe('disable', () => {
    it('requires a valid password and TOTP code', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', passwordHash: 'h' });
      passwords.compare.mockResolvedValue(false);
      await expect(service.disable('u1', 'bad', '123456')).rejects.toMatchObject({
        status: 401,
      });
    });
  });
});
