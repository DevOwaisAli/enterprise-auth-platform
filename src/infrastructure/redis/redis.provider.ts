import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

import { type RedisConfig, REDIS_CONFIG_KEY } from '@config/redis.config';

import { REDIS_CLIENT } from './redis.constants';

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Redis => {
    const logger = new Logger('RedisProvider');
    const config = configService.getOrThrow<RedisConfig>(REDIS_CONFIG_KEY);

    const client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      lazyConnect: false,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(1_000 * 2 ** Math.min(times, 6), 30_000),
    });

    let lastErrorSignature = '';
    let connectedOnce = false;

    client.on('connect', () => {
      connectedOnce = true;
      lastErrorSignature = '';
      logger.log(`Redis connected at ${config.host}:${config.port}`);
    });

    client.on('ready', () => logger.log('Redis ready'));

    client.on('error', (error: Error & { code?: string }) => {
      const signature = `${error.code ?? ''}:${error.message ?? ''}`;
      if (signature === lastErrorSignature) {
        return;
      }
      lastErrorSignature = signature;
      const detail = error.message || error.code || 'unknown error';
      logger.error(`Redis error (${config.host}:${config.port}): ${detail}`);
    });

    client.on('end', () => {
      if (connectedOnce) {
        logger.warn('Redis connection ended');
      }
    });

    return client;
  },
};
