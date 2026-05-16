import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Response } from 'express';
import { type Observable, map } from 'rxjs';

import { RESPONSE_MESSAGE_KEY } from '@common/decorators/response-message.decorator';
import { type ApiSuccessResponse, type ResponseMeta } from '@common/types';
import { RequestContext } from '@common/utils/request-context';

interface MetaCarryingPayload<T> {
  data: T;
  meta?: ResponseMeta;
  message?: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessResponse<T>> {
    const handlerMessage = this.reflector.getAllAndOverride<string | undefined>(
      RESPONSE_MESSAGE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      map((payload) => {
        const { data, meta, message } = this.unwrap(payload);
        return {
          success: true,
          statusCode: response.statusCode ?? HttpStatus.OK,
          message: message ?? handlerMessage ?? 'Success',
          data,
          ...(meta ? { meta } : {}),
          timestamp: new Date().toISOString(),
          correlationId: RequestContext.getCorrelationId(),
        };
      }),
    );
  }

  private unwrap(payload: unknown): MetaCarryingPayload<T> {
    if (
      payload !== null &&
      typeof payload === 'object' &&
      'data' in payload &&
      ('meta' in payload || 'message' in payload)
    ) {
      const carry = payload as MetaCarryingPayload<T>;
      return { data: carry.data, meta: carry.meta, message: carry.message };
    }
    return { data: payload as T };
  }
}
