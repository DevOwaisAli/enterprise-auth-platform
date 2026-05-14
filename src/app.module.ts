import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { HttpExceptionFilter } from '@common/filters';
import { TransformInterceptor } from '@common/interceptors';
import { CorrelationIdMiddleware, RequestLoggerMiddleware } from '@common/middleware';
import { configurations, envValidationSchema } from '@config/index';
import { DatabaseModule } from '@infrastructure/database';
import { LoggerModule } from '@infrastructure/logger';
import { RedisModule } from '@infrastructure/redis';
import { HealthModule } from '@modules/health';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: configurations,
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    LoggerModule,
    DatabaseModule,
    RedisModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CorrelationIdMiddleware, RequestLoggerMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
