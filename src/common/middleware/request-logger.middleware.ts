import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { type NextFunction, type Response } from 'express';

import { type RequestWithContext } from '@common/types';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: RequestWithContext, res: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    const { method, originalUrl } = req;

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const message = `${method} ${originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`;
      const context = req.correlationId ? `cid=${req.correlationId}` : undefined;
      this.logger.log(context ? `${message} [${context}]` : message);
    });

    next();
  }
}
