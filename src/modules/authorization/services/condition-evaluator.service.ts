import { Injectable } from '@nestjs/common';
import { AttributeValueType, PolicyOperator } from '@prisma/client';

import { type AuthorizationContext, type SerializedPolicyCondition } from '../interfaces';

import { AttributeResolverService } from './attribute-resolver.service';

export interface ConditionEvaluation {
  passed: boolean;
  actual: unknown;
  expected: unknown;
}

@Injectable()
export class ConditionEvaluatorService {
  constructor(private readonly attributeResolver: AttributeResolverService) {}

  evaluate(
    condition: SerializedPolicyCondition,
    context: AuthorizationContext,
  ): ConditionEvaluation {
    const actual = this.attributeResolver.resolve(
      context,
      condition.attributeSource,
      condition.attributePath,
    );
    const expected = this.expectedValue(condition, context);
    const isCollectionOp =
      condition.operator === PolicyOperator.IN || condition.operator === PolicyOperator.NOT_IN;
    const coercedActual = this.coerce(actual, condition.valueType);
    const coercedExpected =
      isCollectionOp && Array.isArray(expected)
        ? expected
        : this.coerce(expected, condition.valueType);

    return {
      actual: coercedActual,
      expected: coercedExpected,
      passed: this.applyOperator(condition.operator, coercedActual, coercedExpected),
    };
  }

  private expectedValue(
    condition: SerializedPolicyCondition,
    context: AuthorizationContext,
  ): unknown {
    if (typeof condition.value === 'string') {
      return this.attributeResolver.resolveCompareTarget(context, condition.value);
    }
    return condition.value;
  }

  private coerce(value: unknown, valueType: AttributeValueType): unknown {
    if (value === undefined || value === null) {
      return value;
    }
    switch (valueType) {
      case AttributeValueType.NUMBER:
        return typeof value === 'number' ? value : Number(value);
      case AttributeValueType.BOOLEAN:
        if (typeof value === 'boolean') {
          return value;
        }
        if (value === 'true') {
          return true;
        }
        if (value === 'false') {
          return false;
        }
        return Boolean(value);
      case AttributeValueType.DATE:
        return value instanceof Date ? value : new Date(String(value));
      case AttributeValueType.STRING:
        return typeof value === 'string' ? value : String(value);
      case AttributeValueType.ARRAY:
      case AttributeValueType.JSON:
      default:
        return value;
    }
  }

  private applyOperator(operator: PolicyOperator, actual: unknown, expected: unknown): boolean {
    switch (operator) {
      case PolicyOperator.EQUALS:
        return this.deepEqual(actual, expected);
      case PolicyOperator.NOT_EQUALS:
        return !this.deepEqual(actual, expected);
      case PolicyOperator.IN:
        return Array.isArray(expected) && expected.some((v) => this.deepEqual(v, actual));
      case PolicyOperator.NOT_IN:
        return Array.isArray(expected) && !expected.some((v) => this.deepEqual(v, actual));
      case PolicyOperator.GREATER_THAN:
        return this.numericCompare(actual, expected, (a, b) => a > b);
      case PolicyOperator.GREATER_THAN_OR_EQUAL:
        return this.numericCompare(actual, expected, (a, b) => a >= b);
      case PolicyOperator.LESS_THAN:
        return this.numericCompare(actual, expected, (a, b) => a < b);
      case PolicyOperator.LESS_THAN_OR_EQUAL:
        return this.numericCompare(actual, expected, (a, b) => a <= b);
      case PolicyOperator.CONTAINS:
        if (typeof actual === 'string' && typeof expected === 'string') {
          return actual.includes(expected);
        }
        if (Array.isArray(actual)) {
          return actual.some((v) => this.deepEqual(v, expected));
        }
        return false;
      case PolicyOperator.STARTS_WITH:
        return (
          typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected)
        );
      case PolicyOperator.ENDS_WITH:
        return (
          typeof actual === 'string' && typeof expected === 'string' && actual.endsWith(expected)
        );
      case PolicyOperator.EXISTS:
        return actual !== undefined && actual !== null;
      case PolicyOperator.REGEX_MATCH:
        if (typeof actual !== 'string' || typeof expected !== 'string') {
          return false;
        }
        try {
          return new RegExp(expected).test(actual);
        } catch {
          return false;
        }
      default: {
        const _exhaustive: never = operator;
        return _exhaustive;
      }
    }
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
      return true;
    }
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() === b.getTime();
    }
    if (typeof a !== typeof b) {
      return false;
    }
    if (typeof a !== 'object' || a === null || b === null) {
      return false;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((v, i) => this.deepEqual(v, b[i]));
    }
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const k of keys) {
      if (!this.deepEqual(aObj[k], bObj[k])) {
        return false;
      }
    }
    return true;
  }

  private numericCompare(
    actual: unknown,
    expected: unknown,
    cmp: (a: number, b: number) => boolean,
  ): boolean {
    const a = typeof actual === 'number' ? actual : Number(actual);
    const b = typeof expected === 'number' ? expected : Number(expected);
    if (Number.isNaN(a) || Number.isNaN(b)) {
      return false;
    }
    return cmp(a, b);
  }
}
