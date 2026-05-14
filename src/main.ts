import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';

import { type AppConfig, APP_CONFIG_KEY } from '@config/app.config';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const appConfig = configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);

  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: appConfig.corsOrigin === '*' ? true : appConfig.corsOrigin.split(','),
    credentials: true,
  });

  app.setGlobalPrefix(appConfig.apiPrefix, { exclude: ['health'] });
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (appConfig.swagger.enabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Enterprise Auth Platform API')
      .setDescription(
        'Enterprise-grade authentication and authorization platform. ' +
          'OpenAPI documentation for the public HTTP surface.',
      )
      .setVersion('0.1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          in: 'header',
          name: 'Authorization',
        },
        'access-token',
      )
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(appConfig.swagger.path, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log(`Swagger UI available at /${appConfig.swagger.path}`);
  }

  await app.listen(appConfig.port);
  logger.log(`Server running on port ${appConfig.port} [${appConfig.nodeEnv}]`);
}

void bootstrap();
