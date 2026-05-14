import { type ExecutionContext, createParamDecorator } from '@nestjs/common';

import { type RequestWithContext } from '@common/types';

export const CorrelationId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithContext>();
    return request.correlationId;
  },
);
