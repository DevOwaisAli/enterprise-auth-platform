import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type Request } from 'express';

import { type AuthenticatedUser } from '@common/decorators/current-user.decorator';
import { ForbiddenAppException } from '@common/exceptions';

import { AUTHZ_METADATA_KEYS } from '../constants';
import { type PermissionRequirement } from '../decorators';
import { PermissionService } from '../services/permission.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionRequirement[]>(
      AUTHZ_METADATA_KEYS.PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user?.organizationId || !user.membershipId) {
      throw new ForbiddenAppException('Authentication and active organization required');
    }
    const permissions = await this.permissionService.resolveForMembership(
      user.id,
      user.organizationId,
      user.membershipId,
    );
    const ok = required.every((req) =>
      this.permissionService.hasPermission(permissions, req.resource, req.action),
    );
    if (!ok) {
      throw new ForbiddenAppException('Missing required permission');
    }
    return true;
  }
}
