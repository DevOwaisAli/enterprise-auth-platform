import { registerAs } from '@nestjs/config';

export const AUTH_CONFIG_KEY = 'auth';

export interface PasswordPolicyConfig {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  historyLimit: number;
}

export interface AuthConfig {
  bcryptSaltRounds: number;
  passwordPolicy: PasswordPolicyConfig;
  maxLoginAttempts: number;
  lockDurationMs: number;
  emailVerificationTokenTtlMs: number;
  passwordResetTokenTtlMs: number;
  sessionTtlMs: number;
  appUrl: string;
}

export default registerAs<AuthConfig>(AUTH_CONFIG_KEY, () => ({
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),
  passwordPolicy: {
    minLength: Number(process.env.PASSWORD_MIN_LENGTH ?? 12),
    requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
    requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
    requireNumber: process.env.PASSWORD_REQUIRE_NUMBER !== 'false',
    requireSpecial: process.env.PASSWORD_REQUIRE_SPECIAL !== 'false',
    historyLimit: Number(process.env.PASSWORD_HISTORY_LIMIT ?? 5),
  },
  maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS ?? 5),
  lockDurationMs: Number(process.env.LOCK_DURATION_MS ?? 15 * 60 * 1000),
  emailVerificationTokenTtlMs: Number(
    process.env.EMAIL_VERIFICATION_TOKEN_TTL_MS ?? 24 * 60 * 60 * 1000,
  ),
  passwordResetTokenTtlMs: Number(process.env.PASSWORD_RESET_TOKEN_TTL_MS ?? 60 * 60 * 1000),
  sessionTtlMs: Number(process.env.SESSION_TTL_MS ?? 7 * 24 * 60 * 60 * 1000),
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
}));
