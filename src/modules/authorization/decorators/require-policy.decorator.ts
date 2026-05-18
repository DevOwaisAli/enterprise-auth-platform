import { SetMetadata } from '@nestjs/common';

import { AUTHZ_METADATA_KEYS } from '../constants';

export const RequirePolicy = (...slugs: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHZ_METADATA_KEYS.POLICIES, slugs);
