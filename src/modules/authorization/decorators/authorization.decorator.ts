import { SetMetadata } from '@nestjs/common';

import { AUTHZ_METADATA_KEYS } from '../constants';

export type AuthorizationMode = 'ALL' | 'ANY';

export interface AuthorizationRequirement {
  permissions?: string[];
  policies?: string[];
  mode?: AuthorizationMode;
}

export const Authorization = (
  requirement: AuthorizationRequirement,
): MethodDecorator & ClassDecorator => SetMetadata(AUTHZ_METADATA_KEYS.AUTHORIZATION, requirement);
