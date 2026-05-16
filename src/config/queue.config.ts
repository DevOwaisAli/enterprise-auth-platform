import { registerAs } from '@nestjs/config';

export const QUEUE_CONFIG_KEY = 'queue';

export interface QueueConfig {
  prefix: string;
  defaultAttempts: number;
  defaultBackoffMs: number;
}

export default registerAs<QueueConfig>(QUEUE_CONFIG_KEY, () => ({
  prefix: process.env.QUEUE_PREFIX ?? 'eap',
  defaultAttempts: Number(process.env.QUEUE_DEFAULT_ATTEMPTS ?? 3),
  defaultBackoffMs: Number(process.env.QUEUE_DEFAULT_BACKOFF_MS ?? 5000),
}));
