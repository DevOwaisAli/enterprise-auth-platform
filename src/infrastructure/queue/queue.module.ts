import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { type QueueConfig, QUEUE_CONFIG_KEY } from '@config/queue.config';
import { type RedisConfig, REDIS_CONFIG_KEY } from '@config/redis.config';

import { ALL_QUEUE_NAMES } from './queue.constants';
import { QueueService } from './queue.service';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redis = configService.getOrThrow<RedisConfig>(REDIS_CONFIG_KEY);
        const queue = configService.getOrThrow<QueueConfig>(QUEUE_CONFIG_KEY);
        return {
          prefix: queue.prefix,
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password,
            db: redis.db,
            maxRetriesPerRequest: null,
          },
          defaultJobOptions: {
            attempts: queue.defaultAttempts,
            backoff: { type: 'exponential', delay: queue.defaultBackoffMs },
            removeOnComplete: { age: 3600, count: 1000 },
            removeOnFail: { age: 24 * 3600 },
          },
        };
      },
    }),
    ...ALL_QUEUE_NAMES.map((name) => BullModule.registerQueue({ name })),
  ],
  providers: [QueueService],
  exports: [BullModule, QueueService],
})
export class QueueModule {}
