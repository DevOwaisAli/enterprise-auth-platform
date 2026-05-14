import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Response } from 'express';

import { AppException } from '@common/exceptions';
import { type ApiErrorResponse, type RequestWithContext } from '@common/types';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithContext>();

    const { status, code, message, details } = this.normalize(exception);

    const payload: ApiErrorResponse = {
      success: false,
      error: { code, message, details },
      meta: {
        timestamp: new Date().toISOString(),
        correlationId: request.correlationId,
        path: request.originalUrl,
      },
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status} ${code}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.originalUrl} -> ${status} ${code}`);
    }

    response.status(status).json(payload);
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof AppException) {
      const body = exception.getResponse();
      const status = exception.getStatus();
      const details =
        typeof body === 'object' && body !== null && 'details' in body
          ? (body as { details?: unknown }).details
          : undefined;
      return { status, code: exception.code, message: exception.message, details };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const rawMessage = (body as { message?: string | string[] }).message;
      const message: string | string[] =
        typeof body === 'string' ? body : (rawMessage ?? exception.message);
      return {
        status,
        code: HttpStatus[status] ?? 'HTTP_ERROR',
        message: Array.isArray(message) ? message.join('; ') : message,
        details: typeof body === 'object' ? body : undefined,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    };
  }
}
