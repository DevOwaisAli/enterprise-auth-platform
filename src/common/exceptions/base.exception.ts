import { HttpException, HttpStatus } from '@nestjs/common';

export interface AppExceptionPayload {
  code: string;
  message: string;
  details?: unknown;
}

export class AppException extends HttpException {
  readonly code: string;
  readonly details?: unknown;

  constructor(payload: AppExceptionPayload, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super({ code: payload.code, message: payload.message, details: payload.details }, status);
    this.code = payload.code;
    this.details = payload.details;
  }
}
