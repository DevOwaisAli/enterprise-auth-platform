import { SetMetadata } from '@nestjs/common';
import { type AttributeSource, type PolicyOperator } from '@prisma/client';

import { AUTHZ_METADATA_KEYS } from '../constants';

export interface InlineAttributeRequirement {
  source: AttributeSource;
  path: string;
  operator: PolicyOperator;
  value?: unknown;
  compareWith?: string;
}

export const RequireAttributes = (
  ...requirements: InlineAttributeRequirement[]
): MethodDecorator & ClassDecorator => SetMetadata(AUTHZ_METADATA_KEYS.ATTRIBUTES, requirements);
