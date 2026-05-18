import { SetMetadata } from '@nestjs/common';

import { AUTHZ_METADATA_KEYS } from '../constants';

export interface OwnershipRequirement {
  resourceType: string;
  paramName?: string;
  ownerField?: string;
}

export const RequireOwnership = (
  resourceType: string,
  options: { paramName?: string; ownerField?: string } = {},
): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHZ_METADATA_KEYS.OWNERSHIP, {
    resourceType,
    paramName: options.paramName ?? 'id',
    ownerField: options.ownerField ?? 'ownerId',
  } satisfies OwnershipRequirement);
