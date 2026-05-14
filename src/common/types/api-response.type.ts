export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta: {
    timestamp: string;
    correlationId?: string;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    timestamp: string;
    correlationId?: string;
    path: string;
  };
}
