import { createHash, randomBytes } from 'node:crypto';

import { MFA_CONSTANTS } from '../constants';

export function generateBackupCode(): string {
  const raw = randomBytes(MFA_CONSTANTS.BACKUP_CODE_BYTES)
    .toString('base64')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 8);
  const padded = raw.padEnd(8, '0');
  const group = MFA_CONSTANTS.BACKUP_CODE_GROUP_SIZE;
  return `${padded.slice(0, group)}-${padded.slice(group)}`;
}

export function generateBackupCodes(count: number): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    codes.add(generateBackupCode());
  }
  return Array.from(codes);
}

export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export function normalizeBackupCode(code: string): string {
  return code.trim().toUpperCase();
}
