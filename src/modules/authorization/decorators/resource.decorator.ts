import { SetMetadata } from '@nestjs/common';

import { AUTHZ_METADATA_KEYS } from '../constants';

export interface ResourceMetadata {
  resourceType: string;
  paramName?: string;
}

export const Resource = (
  resourceType: string,
  paramName: string = 'id',
): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHZ_METADATA_KEYS.RESOURCE, { resourceType, paramName });
