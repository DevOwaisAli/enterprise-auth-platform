import { AttributeSource, AttributeValueType, PolicyOperator } from '@prisma/client';

import { type AuthenticatedUser } from '@common/decorators/current-user.decorator';

import { type AuthorizationContext, type SerializedPolicyCondition } from '../interfaces';

import { AttributeResolverService } from './attribute-resolver.service';
import { ConditionEvaluatorService } from './condition-evaluator.service';

function buildContext(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  const user: AuthenticatedUser = {
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
  return {
    user,
    resource: 'users',
    action: 'read',
    organizationId: 'org-1',
    resourceData: { id: 'user-1', ownerId: 'user-1', organizationId: 'org-1', department: 'eng' },
    request: { ip: null, userAgent: null, method: 'GET', path: '/', headers: {} },
    attributes: {
      user: { id: 'user-1', email: 'a@b.com' },
      membership: { department: 'eng', region: 'us-east', clearanceLevel: 3, roles: ['user'] },
      organization: { id: 'org-1', plan: 'ENTERPRISE' },
    },
    permissions: [],
    policies: [],
    ...overrides,
  };
}

function condition(partial: Partial<SerializedPolicyCondition>): SerializedPolicyCondition {
  return {
    id: 'c1',
    attributeSource: AttributeSource.RESOURCE,
    attributePath: 'ownerId',
    operator: PolicyOperator.EQUALS,
    value: 'USER.id',
    valueType: AttributeValueType.STRING,
    ...partial,
  };
}

describe('ConditionEvaluatorService', () => {
  const evaluator = new ConditionEvaluatorService(new AttributeResolverService());

  it('USER.id reference resolves and EQUALS passes when owner matches caller', () => {
    const result = evaluator.evaluate(condition({}), buildContext());
    expect(result.passed).toBe(true);
  });

  it('EQUALS fails when owner differs from caller', () => {
    const ctx = buildContext({
      resourceData: { id: 'user-1', ownerId: 'someone-else', organizationId: 'org-1' },
    });
    const result = evaluator.evaluate(condition({}), ctx);
    expect(result.passed).toBe(false);
  });

  it('CONTAINS works against array attribute', () => {
    const result = evaluator.evaluate(
      condition({
        attributeSource: AttributeSource.MEMBERSHIP,
        attributePath: 'roles',
        operator: PolicyOperator.CONTAINS,
        value: 'user',
      }),
      buildContext(),
    );
    expect(result.passed).toBe(true);
  });

  it('GREATER_THAN_OR_EQUAL coerces numbers', () => {
    const result = evaluator.evaluate(
      condition({
        attributeSource: AttributeSource.MEMBERSHIP,
        attributePath: 'clearanceLevel',
        operator: PolicyOperator.GREATER_THAN_OR_EQUAL,
        value: 2,
        valueType: AttributeValueType.NUMBER,
      }),
      buildContext(),
    );
    expect(result.passed).toBe(true);
  });

  it('EXISTS returns false for missing path', () => {
    const result = evaluator.evaluate(
      condition({
        attributeSource: AttributeSource.MEMBERSHIP,
        attributePath: 'nonexistent',
        operator: PolicyOperator.EXISTS,
        value: null,
      }),
      buildContext(),
    );
    expect(result.passed).toBe(false);
  });

  it('REGEX_MATCH respects pattern', () => {
    const result = evaluator.evaluate(
      condition({
        attributeSource: AttributeSource.USER,
        attributePath: 'email',
        operator: PolicyOperator.REGEX_MATCH,
        value: '^[^@]+@[^@]+$',
      }),
      buildContext(),
    );
    expect(result.passed).toBe(true);
  });

  it('IN with array expected', () => {
    const result = evaluator.evaluate(
      condition({
        attributeSource: AttributeSource.MEMBERSHIP,
        attributePath: 'region',
        operator: PolicyOperator.IN,
        value: ['us-east', 'eu-west'],
      }),
      buildContext(),
    );
    expect(result.passed).toBe(true);
  });
});
