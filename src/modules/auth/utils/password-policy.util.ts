import { type PasswordPolicyConfig } from '@config/auth.config';

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

const SPECIAL_CHARS = /[!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|`~]/;

export function evaluatePassword(
  password: string,
  policy: PasswordPolicyConfig,
): PasswordPolicyResult {
  const errors: string[] = [];

  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (policy.requireNumber && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (policy.requireSpecial && !SPECIAL_CHARS.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return { valid: errors.length === 0, errors };
}
