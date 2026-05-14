import { Injectable, type NestMiddleware } from '@nestjs/common';
import { type NextFunction, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { CORRELATION_ID_HEADER } from '@common/constants';
import { type RequestWithContext } from '@common/types';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: RequestWithContext, res: Response, next: NextFunction): void {
    const incoming = req.header(CORRELATION_ID_HEADER);
    const correlationId = incoming && incoming.length > 0 ? incoming : uuidv4();
    req.correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
