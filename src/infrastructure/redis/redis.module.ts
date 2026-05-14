import { Global, Module } from '@nestjs/common';

import { redisProvider } from './redis.provider';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [redisProvider, RedisService],
  exports: [redisProvider, RedisService],
})
export class RedisModule {}
