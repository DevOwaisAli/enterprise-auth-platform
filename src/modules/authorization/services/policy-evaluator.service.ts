import { Injectable } from '@nestjs/common';
import { PolicyEffect } from '@prisma/client';

import {
  type AuthorizationContext,
  type AuthorizationDecision,
  type SerializedPolicy,
} from '../interfaces';

import { ConditionEvaluatorService } from './condition-evaluator.service';

@Injectable()
export class PolicyEvaluatorService {
  constructor(private readonly conditionEvaluator: ConditionEvaluatorService) {}

  evaluate(context: AuthorizationContext): AuthorizationDecision {
    const candidates = context.policies
      .filter((policy) => policy.isEnabled)
      .filter((policy) => this.matchesResource(policy, context.resource, context.action))
      .sort((a, b) => b.priority - a.priority);

    const matched: AuthorizationDecision['matchedPolicies'] = [];
    const failed: AuthorizationDecision['failedConditions'] = [];

    let allowMatched = false;
    let denyMatched: SerializedPolicy | null = null;

    for (const policy of candidates) {
      const conditionsPass = this.allConditionsPass(policy, context, failed);
      if (!conditionsPass) {
        continue;
      }
      matched.push({ id: policy.id, name: policy.name, effect: policy.effect });
      if (policy.effect === PolicyEffect.DENY) {
        denyMatched = policy;
        break;
      }
      allowMatched = true;
    }

    if (denyMatched) {
      return {
        allowed: false,
        reason: `Access denied by policy "${denyMatched.name}"`,
        matchedPolicies: matched,
        failedConditions: failed,
      };
    }

    if (allowMatched) {
      return {
        allowed: true,
        reason: 'Access granted by policy',
        matchedPolicies: matched,
        failedConditions: failed,
      };
    }

    return {
      allowed: false,
      reason: 'No matching ALLOW policy',
      matchedPolicies: matched,
      failedConditions: failed,
    };
  }

  private matchesResource(policy: SerializedPolicy, resource: string, action: string): boolean {
    const resourceMatches = policy.resource === '*' || policy.resource === resource;
    const actionMatches = policy.action === '*' || policy.action === action;
    return resourceMatches && actionMatches;
  }

  private allConditionsPass(
    policy: SerializedPolicy,
    context: AuthorizationContext,
    failed: AuthorizationDecision['failedConditions'],
  ): boolean {
    if (policy.conditions.length === 0) {
      return true;
    }
    for (const condition of policy.conditions) {
      const result = this.conditionEvaluator.evaluate(condition, context);
      if (!result.passed) {
        failed.push({
          policyId: policy.id,
          conditionId: condition.id,
          attributeSource: condition.attributeSource,
          attributePath: condition.attributePath,
          operator: condition.operator,
          actualValue: result.actual,
          expectedValue: result.expected,
        });
        return false;
      }
    }
    return true;
  }
}
