import 'reflect-metadata';

import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { type AppConfig, APP_CONFIG_KEY } from '@config/app.config';
import { type SwaggerConfig, SWAGGER_CONFIG_KEY } from '@config/swagger.config';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const appConfig = configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);
  const swaggerConfig = configService.getOrThrow<SwaggerConfig>(SWAGGER_CONFIG_KEY);

  app.use(helmet());
  app.use(compression());
  app.useBodyParser('json', { limit: appConfig.bodyLimit });
  app.useBodyParser('urlencoded', { limit: appConfig.bodyLimit, extended: true });
  app.enableCors({
    origin: appConfig.corsOrigin === '*' ? true : appConfig.corsOrigin.split(','),
    credentials: true,
  });

  app.setGlobalPrefix(appConfig.apiPrefix, { exclude: ['health'] });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: appConfig.apiDefaultVersion,
  });
  app.enableShutdownHooks();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (swaggerConfig.enabled) {
    const docConfig = new DocumentBuilder()
      .setTitle(swaggerConfig.title)
      .setDescription(swaggerConfig.description)
      .setVersion(swaggerConfig.version)
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
    const document = SwaggerModule.createDocument(app, docConfig);
    SwaggerModule.setup(swaggerConfig.path, app, document, {
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    });
  }

  await app.listen(appConfig.port);

  const logger = app.get(Logger);
  logger.log(`Server listening on port ${appConfig.port} [${appConfig.nodeEnv}]`);
  logger.log(`API prefix: /${appConfig.apiPrefix}/v${appConfig.apiDefaultVersion}`);
  if (swaggerConfig.enabled) {
    logger.log(`Swagger UI: /${swaggerConfig.path}`);
  }
  logger.log(`Health: /health`);
}

void bootstrap();
