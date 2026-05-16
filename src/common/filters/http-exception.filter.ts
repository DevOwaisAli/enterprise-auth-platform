import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type Response } from 'express';

import { AppException } from '@common/exceptions';
import { type ApiErrorDetail, type ApiErrorResponse, type RequestWithContext } from '@common/types';
import { RequestContext } from '@common/utils/request-context';

interface NormalizedError {
  status: number;
  code: string;
  message: string;
  errors: ApiErrorDetail[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithContext>();
    const correlationId = RequestContext.getCorrelationId() ?? request.correlationId;

    const normalized = this.normalize(exception);
    const payload: ApiErrorResponse = {
      success: false,
      statusCode: normalized.status,
      message: normalized.message,
      ...(normalized.errors.length > 0 ? { errors: normalized.errors } : {}),
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    };

    if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${normalized.status} ${normalized.code}`,
        stack,
      );
    }

    response.status(normalized.status).json(payload);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        errors: exception.errors,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.normalizePrismaError(exception);
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'DATABASE_VALIDATION_ERROR',
        message: 'Invalid database query',
        errors: [],
      };
    }

    if (exception instanceof HttpException) {
      return this.normalizeHttpException(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      errors: [],
    };
  }

  private normalizeHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const body = exception.getResponse();

    if (typeof body === 'string') {
      return {
        status,
        code: HttpStatus[status] ?? 'HTTP_ERROR',
        message: body,
        errors: [],
      };
    }

    const obj = body as {
      message?: string | string[];
      error?: string;
      code?: string;
      errors?: ApiErrorDetail[];
    };

    if (Array.isArray(obj.message)) {
      const errors: ApiErrorDetail[] = obj.message.map((m) => ({ message: m }));
      return {
        status,
        code: obj.code ?? 'VALIDATION_FAILED',
        message: 'Validation failed',
        errors,
      };
    }

    return {
      status,
      code: obj.code ?? HttpStatus[status] ?? 'HTTP_ERROR',
      message: obj.message ?? exception.message,
      errors: obj.errors ?? [],
    };
  }

  private normalizePrismaError(exception: Prisma.PrismaClientKnownRequestError): NormalizedError {
    switch (exception.code) {
      case 'P2002': {
        const target = exception.meta?.target;
        const fields = Array.isArray(target) ? target.join(', ') : String(target ?? 'field');
        return {
          status: HttpStatus.CONFLICT,
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: `Unique constraint failed on ${fields}`,
          errors: [{ field: fields, code: 'UNIQUE', message: 'Value already exists' }],
        };
      }
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'RECORD_NOT_FOUND',
          message: 'The requested record was not found',
          errors: [],
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'FOREIGN_KEY_VIOLATION',
          message: 'Foreign key constraint failed',
          errors: [],
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          code: `PRISMA_${exception.code}`,
          message: 'Database request failed',
          errors: [],
        };
    }
  }
}
