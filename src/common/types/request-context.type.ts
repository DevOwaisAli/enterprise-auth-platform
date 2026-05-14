import { type Request } from 'express';

export interface RequestWithContext extends Request {
  correlationId: string;
}
