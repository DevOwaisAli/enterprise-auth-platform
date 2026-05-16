import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { HttpExceptionFilter } from '@common/filters';
import { TransformInterceptor } from '@common/interceptors';
import { CorrelationIdMiddleware } from '@common/middleware';
import { configurations, envValidationSchema } from '@config/index';
import { type ThrottleConfig, THROTTLE_CONFIG_KEY } from '@config/throttle.config';
import { CacheModule } from '@infrastructure/cache';
import { DatabaseModule } from '@infrastructure/database';
import { LoggerModule } from '@infrastructure/logger';
import { MailModule } from '@infrastructure/mail';
import { QueueModule } from '@infrastructure/queue';
import { RedisModule } from '@infrastructure/redis';
import { AuditModule } from '@modules/audit';
import { HealthModule } from '@modules/health';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: configurations,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const config = configService.getOrThrow<ThrottleConfig>(THROTTLE_CONFIG_KEY);
        return [{ ttl: config.ttlMs, limit: config.limit }];
      },
    }),
    LoggerModule,
    DatabaseModule,
    RedisModule,
    CacheModule,
    QueueModule,
    MailModule,
    AuditModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
