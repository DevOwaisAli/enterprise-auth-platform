import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(rawKey: string): Buffer {
  if (!rawKey || rawKey.length === 0) {
    throw new Error('Federation encryption key is not configured');
  }
  return createHash('sha256').update(rawKey).digest();
}

export interface AesGcmEncryptOptions {
  encryptionKey: string;
}

export function encryptAesGcm(plaintext: string, options: AesGcmEncryptOptions): string {
  const key = deriveKey(options.encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptAesGcm(ciphertext: string, options: AesGcmEncryptOptions): string {
  const key = deriveKey(options.encryptionKey);
  const data = Buffer.from(ciphertext, 'base64');
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Ciphertext is malformed');
  }
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
