import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type Redis } from 'ioredis';

import { REDIS_CLIENT } from './redis.constants';

const HEALTH_CHECK_TIMEOUT_MS = 1_000;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  getClient(): Redis {
    return this.client;
  }

  async isHealthy(): Promise<boolean> {
    if (this.client.status !== 'ready') {
      return false;
    }

    try {
      const ping = this.client.ping();
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Redis ping timed out after ${HEALTH_CHECK_TIMEOUT_MS}ms`)),
          HEALTH_CHECK_TIMEOUT_MS,
        ),
      );
      const result = await Promise.race([ping, timeout]);
      return result === 'PONG';
    } catch (error) {
      this.logger.warn(`Redis health check failed: ${(error as Error).message}`);
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.client.status === 'ready' || this.client.status === 'connect') {
        await this.client.quit();
      } else {
        this.client.disconnect();
      }
      this.logger.log('Redis client disconnected');
    } catch (error) {
      this.logger.warn(`Redis shutdown error (ignored): ${(error as Error).message}`);
    }
  }
}
