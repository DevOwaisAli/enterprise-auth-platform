import {
  generateBackupCode,
  generateBackupCodes,
  hashBackupCode,
  normalizeBackupCode,
} from './backup-codes.util';

describe('backup-codes.util', () => {
  it('generates codes in XXXX-XXXX format', () => {
    const code = generateBackupCode();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('generates the requested number of unique codes', () => {
    const codes = generateBackupCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
  });

  it('hashes consistently and is case/space insensitive via normalization', () => {
    const code = 'abcd-1234';
    const h1 = hashBackupCode(code);
    const h2 = hashBackupCode('  ABCD-1234 ');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('normalizes codes to upper case', () => {
    expect(normalizeBackupCode('  abcd-1234 ')).toBe('ABCD-1234');
  });
});
