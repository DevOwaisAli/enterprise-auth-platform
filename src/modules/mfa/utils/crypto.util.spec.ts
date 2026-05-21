import { decryptAesGcm, encryptAesGcm } from './crypto.util';

const KEY = 'a-very-strong-test-encryption-key-1234567890';

describe('crypto.util (AES-256-GCM)', () => {
  it('round-trips plaintext', () => {
    const plain = 'JBSWY3DPEHPK3PXP';
    const ciphertext = encryptAesGcm(plain, { encryptionKey: KEY });
    expect(ciphertext).not.toContain(plain);
    expect(decryptAesGcm(ciphertext, { encryptionKey: KEY })).toBe(plain);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const a = encryptAesGcm('secret', { encryptionKey: KEY });
    const b = encryptAesGcm('secret', { encryptionKey: KEY });
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with the wrong key', () => {
    const ciphertext = encryptAesGcm('secret', { encryptionKey: KEY });
    expect(() => decryptAesGcm(ciphertext, { encryptionKey: 'wrong-key' })).toThrow();
  });

  it('throws when key is missing', () => {
    expect(() => encryptAesGcm('x', { encryptionKey: '' })).toThrow();
  });
});
