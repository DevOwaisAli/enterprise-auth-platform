import { HttpException, HttpStatus } from '@nestjs/common';

import { type ApiErrorDetail } from '@common/types';

export interface AppExceptionOptions {
  code?: string;
  message: string;
  errors?: ApiErrorDetail[];
  status?: HttpStatus;
  cause?: unknown;
}

export class AppException extends HttpException {
  readonly code: string;
  readonly errors: ApiErrorDetail[];

  constructor(options: AppExceptionOptions) {
    const status = options.status ?? HttpStatus.BAD_REQUEST;
    super(
      { code: options.code ?? 'APP_ERROR', message: options.message, errors: options.errors ?? [] },
      status,
      { cause: options.cause },
    );
    this.code = options.code ?? 'APP_ERROR';
    this.errors = options.errors ?? [];
  }
}

export class NotFoundAppException extends AppException {
  constructor(message = 'Resource not found', errors?: ApiErrorDetail[]) {
    super({ code: 'NOT_FOUND', message, errors, status: HttpStatus.NOT_FOUND });
  }
}

export class ValidationAppException extends AppException {
  constructor(errors: ApiErrorDetail[], message = 'Validation failed') {
    super({ code: 'VALIDATION_FAILED', message, errors, status: HttpStatus.BAD_REQUEST });
  }
}

export class UnauthorizedAppException extends AppException {
  constructor(message = 'Unauthorized') {
    super({ code: 'UNAUTHORIZED', message, status: HttpStatus.UNAUTHORIZED });
  }
}

export class ForbiddenAppException extends AppException {
  constructor(message = 'Forbidden') {
    super({ code: 'FORBIDDEN', message, status: HttpStatus.FORBIDDEN });
  }
}

export class ConflictAppException extends AppException {
  constructor(message = 'Conflict', errors?: ApiErrorDetail[]) {
    super({ code: 'CONFLICT', message, errors, status: HttpStatus.CONFLICT });
  }
}
