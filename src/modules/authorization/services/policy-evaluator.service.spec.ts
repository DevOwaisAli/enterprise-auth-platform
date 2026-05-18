import { AttributeSource, AttributeValueType, PolicyEffect, PolicyOperator } from '@prisma/client';

import { type AuthenticatedUser } from '@common/decorators/current-user.decorator';

import { type AuthorizationContext, type SerializedPolicy } from '../interfaces';

import { AttributeResolverService } from './attribute-resolver.service';
import { ConditionEvaluatorService } from './condition-evaluator.service';
import { PolicyEvaluatorService } from './policy-evaluator.service';

function user(): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'a@b.com',
    sessionId: 's-1',
    tokenVersion: 0,
    organizationId: 'org-1',
    membershipId: 'mem-1',
    roles: ['user'],
    permissionsVersion: 1,
    attributesVersion: 1,
  };
}

function ctx(
  policies: SerializedPolicy[],
  extra: Partial<AuthorizationContext> = {},
): AuthorizationContext {
  return {
    user: user(),
    resource: 'users',
    action: 'read',
    organizationId: 'org-1',
    resourceData: { id: 'user-1', ownerId: 'user-1', organizationId: 'org-1', department: 'eng' },
    request: { ip: null, userAgent: null, method: 'GET', path: '/users', headers: {} },
    attributes: {
      user: { id: 'user-1', email: 'a@b.com' },
      membership: { department: 'eng', status: 'ACTIVE' },
      organization: { id: 'org-1', plan: 'ENTERPRISE' },
    },
    permissions: [],
    policies,
    ...extra,
  };
}

function policy(over: Partial<SerializedPolicy> = {}): SerializedPolicy {
  return {
    id: 'p1',
    name: 'Allow everything',
    slug: 'allow-all',
    description: null,
    effect: PolicyEffect.ALLOW,
    resource: '*',
    action: '*',
    priority: 100,
    isEnabled: true,
    isSystem: false,
    conditions: [],
    ...over,
  };
}

describe('PolicyEvaluatorService', () => {
  const evaluator = new PolicyEvaluatorService(
    new ConditionEvaluatorService(new AttributeResolverService()),
  );

  it('DENY policy overrides ALLOW even with higher allow priority', () => {
    const decision = evaluator.evaluate(
      ctx([
        policy({ id: 'p-allow', slug: 'allow', priority: 999 }),
        policy({
          id: 'p-deny',
          slug: 'deny-sus',
          name: 'Deny suspended',
          effect: PolicyEffect.DENY,
          priority: 10000,
          conditions: [
            {
              id: 'c1',
              attributeSource: AttributeSource.MEMBERSHIP,
              attributePath: 'status',
              operator: PolicyOperator.EQUALS,
              value: 'ACTIVE',
              valueType: AttributeValueType.STRING,
            },
          ],
        }),
      ]),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.matchedPolicies.some((p) => p.effect === PolicyEffect.DENY)).toBe(true);
  });

  it('disabled policy is ignored', () => {
    const decision = evaluator.evaluate(ctx([policy({ isEnabled: false })]));
    expect(decision.allowed).toBe(false);
  });

  it('ALLOW policy with matching conditions grants access', () => {
    const decision = evaluator.evaluate(
      ctx([
        policy({
          slug: 'own-profile',
          resource: 'users',
          action: 'read',
          conditions: [
            {
              id: 'c1',
              attributeSource: AttributeSource.RESOURCE,
              attributePath: 'ownerId',
              operator: PolicyOperator.EQUALS,
              value: 'USER.id',
              valueType: AttributeValueType.STRING,
            },
          ],
        }),
      ]),
    );
    expect(decision.allowed).toBe(true);
  });

  it('non-matching resource is skipped', () => {
    const decision = evaluator.evaluate(ctx([policy({ resource: 'orders', action: 'read' })]));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('No matching ALLOW policy');
  });
});
