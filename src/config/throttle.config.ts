import { registerAs } from '@nestjs/config';

export const THROTTLE_CONFIG_KEY = 'throttle';

export interface ThrottleConfig {
  ttlMs: number;
  limit: number;
}

export default registerAs<ThrottleConfig>(THROTTLE_CONFIG_KEY, () => ({
  ttlMs: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
  limit: Number(process.env.THROTTLE_LIMIT ?? 100),
}));
