import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Redis } from 'ioredis';

import { REDIS_CLIENT } from '@infrastructure/redis/redis.constants';

export interface CacheSetOptions {
  ttlSeconds?: number;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      if (raw === null) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(`Cache get failed for ${key}: ${(error as Error).message}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, options: CacheSetOptions = {}): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      if (options.ttlSeconds && options.ttlSeconds > 0) {
        await this.client.set(key, serialized, 'EX', options.ttlSeconds);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      this.logger.warn(`Cache set failed for ${key}: ${(error as Error).message}`);
      return false;
    }
  }

  async delete(...keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }
    try {
      return await this.client.del(...keys);
    } catch (error) {
      this.logger.warn(`Cache delete failed: ${(error as Error).message}`);
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      return (await this.client.exists(key)) > 0;
    } catch (error) {
      this.logger.warn(`Cache exists failed for ${key}: ${(error as Error).message}`);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.warn(`Cache ttl failed for ${key}: ${(error as Error).message}`);
      return -2;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      this.logger.warn(`Cache expire failed for ${key}: ${(error as Error).message}`);
      return false;
    }
  }

  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    options: CacheSetOptions = {},
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const fresh = await loader();
    await this.set(key, fresh, options);
    return fresh;
  }

  buildKey(namespace: string, ...parts: Array<string | number>): string {
    return [namespace, ...parts].join(':');
  }
}
