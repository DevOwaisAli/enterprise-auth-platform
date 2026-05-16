import { type IncomingMessage, type ServerResponse } from 'node:http';

import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { v4 as uuidv4 } from 'uuid';

import { CORRELATION_ID_HEADER } from '@common/constants';
import { RequestContext } from '@common/utils/request-context';
import { type AppConfig, APP_CONFIG_KEY } from '@config/app.config';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const app = configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);
        return {
          pinoHttp: {
            level: app.logLevel,
            transport:
              app.logPretty && !app.isProduction
                ? {
                    target: 'pino-pretty',
                    options: {
                      singleLine: true,
                      colorize: true,
                      translateTime: 'SYS:HH:MM:ss.l',
                      ignore: 'pid,hostname,req,res,responseTime',
                      messageFormat: '[{context}] {msg}',
                    },
                  }
                : undefined,
            genReqId: (req: IncomingMessage, res: ServerResponse): string => {
              const incoming = req.headers[CORRELATION_ID_HEADER.toLowerCase()];
              const correlationId =
                typeof incoming === 'string' && incoming.length > 0 ? incoming : uuidv4();
              res.setHeader(CORRELATION_ID_HEADER, correlationId);
              return correlationId;
            },
            customProps: () => {
              const ctx = RequestContext.get();
              return ctx ? { correlationId: ctx.correlationId, userId: ctx.userId } : {};
            },
            customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
              if (err || res.statusCode >= 500) {
                return 'error';
              }
              if (res.statusCode >= 400) {
                return 'warn';
              }
              return 'info';
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.refreshToken',
                'req.body.accessToken',
                '*.password',
                '*.token',
                '*.secret',
              ],
              censor: '[REDACTED]',
            },
          },
        };
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
