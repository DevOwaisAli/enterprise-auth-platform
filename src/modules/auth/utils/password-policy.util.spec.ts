import { type PasswordPolicyConfig } from '@config/auth.config';

import { evaluatePassword } from './password-policy.util';

const policy: PasswordPolicyConfig = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
  historyLimit: 5,
};

describe('evaluatePassword', () => {
  it('accepts a strong password', () => {
    const result = evaluatePassword('CorrectHorse-Battery-9!', policy);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects passwords below the minimum length', () => {
    const result = evaluatePassword('Aa1!aaaa', policy);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least 12'))).toBe(true);
  });

  it('flags every missing class', () => {
    const result = evaluatePassword('aaaaaaaaaaaa', policy);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('uppercase'),
        expect.stringContaining('number'),
        expect.stringContaining('special'),
      ]),
    );
  });

  it('honors disabled policy requirements', () => {
    const lax: PasswordPolicyConfig = { ...policy, requireSpecial: false, requireUppercase: false };
    const result = evaluatePassword('lowercase-only-12', lax);
    expect(result.valid).toBe(true);
  });
});
