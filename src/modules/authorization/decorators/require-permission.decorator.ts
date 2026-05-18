import { SetMetadata } from '@nestjs/common';

import { AUTHZ_METADATA_KEYS } from '../constants';

export interface PermissionRequirement {
  resource: string;
  action: string;
}

export const RequirePermission = (
  resource: string,
  action: string,
): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHZ_METADATA_KEYS.PERMISSIONS, [{ resource, action }] as PermissionRequirement[]);

export const RequirePermissions = (
  ...permissions: PermissionRequirement[]
): MethodDecorator & ClassDecorator => SetMetadata(AUTHZ_METADATA_KEYS.PERMISSIONS, permissions);
