import { registerAs } from '@nestjs/config';

export const REDIS_CONFIG_KEY = 'redis';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
}

export default registerAs<RedisConfig>(REDIS_CONFIG_KEY, () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD ? process.env.REDIS_PASSWORD : undefined,
  db: Number(process.env.REDIS_DB ?? 0),
}));
