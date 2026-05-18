import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { type Request } from 'express';

import { ForbiddenAppException } from '@common/exceptions';

import { type AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenAppException('Authentication required');
    }
    const params = (request.params ?? {}) as Record<string, string | undefined>;
    const paramOrgId = params.orgId ?? params.organizationId;
    if (paramOrgId && paramOrgId !== user.organizationId) {
      throw new ForbiddenAppException('Cross-tenant access denied');
    }
    return true;
  }
}
