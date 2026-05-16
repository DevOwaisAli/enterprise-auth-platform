import { generateSecureToken, hashToken, timingSafeEqualHex } from './token-hash.util';

describe('token-hash util', () => {
  it('generates tokens of the requested byte length', () => {
    const token = generateSecureToken(32);
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it('hashes deterministically with SHA-256 (64 hex chars)', () => {
    const a = hashToken('hello');
    const b = hashToken('hello');
    expect(a).toEqual(b);
    expect(a).toHaveLength(64);
  });

  it('produces different hashes for different inputs', () => {
    expect(hashToken('a')).not.toEqual(hashToken('b'));
  });

  it('compares hex strings in timing-safe manner', () => {
    const a = hashToken('same');
    const b = hashToken('same');
    expect(timingSafeEqualHex(a, b)).toBe(true);
    expect(timingSafeEqualHex(a, hashToken('different'))).toBe(false);
  });

  it('returns false for mismatched lengths instead of throwing', () => {
    expect(timingSafeEqualHex('abcd', 'abcdef')).toBe(false);
  });
});
