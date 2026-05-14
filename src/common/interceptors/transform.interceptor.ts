import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, map } from 'rxjs';

import { type ApiSuccessResponse, type RequestWithContext } from '@common/types';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiSuccessResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessResponse<T>> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        meta: {
          timestamp: new Date().toISOString(),
          correlationId: request.correlationId,
        },
      })),
    );
  }
}
