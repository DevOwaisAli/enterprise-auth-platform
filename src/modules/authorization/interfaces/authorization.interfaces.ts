import {
  type AttributeSource,
  type AttributeValueType,
  type PolicyEffect,
  type PolicyOperator,
} from '@prisma/client';

import { type AuthenticatedUser } from '@common/decorators/current-user.decorator';

export interface ResolvedPermission {
  resource: string;
  action: string;
}

export interface ResolvedAttributes {
  user: Record<string, unknown>;
  membership: Record<string, unknown>;
  organization: Record<string, unknown>;
}

export interface RequestSnapshot {
  ip: string | null;
  userAgent: string | null;
  method: string | null;
  path: string | null;
  headers: Record<string, string | undefined>;
}

export interface AuthorizationContext {
  user: AuthenticatedUser;
  resource: string;
  action: string;
  organizationId: string | null;
  resourceData: Record<string, unknown> | null;
  resourceId?: string;
  request: RequestSnapshot;
  attributes: ResolvedAttributes;
  permissions: ResolvedPermission[];
  policies: SerializedPolicy[];
}

export interface SerializedPolicyCondition {
  id: string;
  attributeSource: AttributeSource;
  attributePath: string;
  operator: PolicyOperator;
  value: unknown;
  valueType: AttributeValueType;
}

export interface SerializedPolicy {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  effect: PolicyEffect;
  resource: string;
  action: string;
  priority: number;
  isEnabled: boolean;
  isSystem: boolean;
  conditions: SerializedPolicyCondition[];
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: string;
  matchedPolicies: Array<{ id: string; name: string; effect: PolicyEffect }>;
  failedConditions: Array<{
    policyId: string;
    conditionId: string;
    attributeSource: AttributeSource;
    attributePath: string;
    operator: PolicyOperator;
    actualValue: unknown;
    expectedValue: unknown;
  }>;
}
