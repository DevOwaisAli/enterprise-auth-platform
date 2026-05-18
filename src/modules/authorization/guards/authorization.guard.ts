import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AttributeSource, PolicyOperator } from '@prisma/client';
import { type Request } from 'express';

import { type AuthenticatedUser } from '@common/decorators/current-user.decorator';
import { ForbiddenAppException } from '@common/exceptions';
import { extractClientIp, extractUserAgent } from '@common/utils/request-context';
import { AuditAction, AuditResource, AuditService } from '@modules/audit';

import { AUTHZ_METADATA_KEYS } from '../constants';
import {
  type AuthorizationRequirement,
  type InlineAttributeRequirement,
  type OwnershipRequirement,
  type PermissionRequirement,
  type ResourceMetadata,
} from '../decorators';
import {
  type AuthorizationContext,
  type AuthorizationDecision,
  type RequestSnapshot,
  type SerializedPolicyCondition,
} from '../interfaces';
import { AuthorizationService } from '../services/authorization.service';
import { ConditionEvaluatorService } from '../services/condition-evaluator.service';
import { PermissionService } from '../services/permission.service';
import { PolicyService } from '../services/policy.service';
import { ResourceLoaderRegistry } from '../services/resource-loader.registry';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
    private readonly permissionService: PermissionService,
    private readonly policyService: PolicyService,
    private readonly conditionEvaluator: ConditionEvaluatorService,
    private readonly resourceLoaders: ResourceLoaderRegistry,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionsMeta = this.reflector.getAllAndOverride<PermissionRequirement[]>(
      AUTHZ_METADATA_KEYS.PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    const policiesMeta = this.reflector.getAllAndOverride<string[]>(AUTHZ_METADATA_KEYS.POLICIES, [
      context.getHandler(),
      context.getClass(),
    ]);
    const attributesMeta = this.reflector.getAllAndOverride<InlineAttributeRequirement[]>(
      AUTHZ_METADATA_KEYS.ATTRIBUTES,
      [context.getHandler(), context.getClass()],
    );
    const ownershipMeta = this.reflector.getAllAndOverride<OwnershipRequirement>(
      AUTHZ_METADATA_KEYS.OWNERSHIP,
      [context.getHandler(), context.getClass()],
    );
    const authorizationMeta = this.reflector.getAllAndOverride<AuthorizationRequirement>(
      AUTHZ_METADATA_KEYS.AUTHORIZATION,
      [context.getHandler(), context.getClass()],
    );
    const resourceMeta = this.reflector.getAllAndOverride<ResourceMetadata>(
      AUTHZ_METADATA_KEYS.RESOURCE,
      [context.getHandler(), context.getClass()],
    );

    if (
      !permissionsMeta &&
      !policiesMeta &&
      !attributesMeta &&
      !ownershipMeta &&
      !authorizationMeta
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenAppException('Authentication required');
    }

    const resourceData = await this.loadResource(request, resourceMeta ?? ownershipMeta, user);
    const ctx = await this.buildContext(request, user, resourceMeta, resourceData);

    const decisions: AuthorizationDecision[] = [];

    if (permissionsMeta && permissionsMeta.length > 0) {
      for (const requirement of permissionsMeta) {
        const decision = await this.authorizationService.evaluate({
          user,
          resource: requirement.resource,
          action: requirement.action,
          resourceData,
          resourceId: this.extractResourceId(request, resourceMeta ?? ownershipMeta),
          request: ctx.request,
        });
        decisions.push(decision);
      }
    }

    if (policiesMeta && policiesMeta.length > 0) {
      for (const slug of policiesMeta) {
        decisions.push(this.evaluatePolicyBySlug(slug, ctx));
      }
    }

    if (attributesMeta && attributesMeta.length > 0) {
      decisions.push(this.evaluateInlineAttributes(attributesMeta, ctx));
    }

    if (ownershipMeta) {
      decisions.push(this.evaluateOwnership(ownershipMeta, user, resourceData));
    }

    const mode = authorizationMeta?.mode ?? 'ALL';
    const allowed =
      mode === 'ALL' ? decisions.every((d) => d.allowed) : decisions.some((d) => d.allowed);

    if (!allowed) {
      const failed = decisions.find((d) => !d.allowed);
      await this.auditService.record({
        action: AuditAction.POLICY_DENIED,
        resource: AuditResource.POLICY,
        actor: { userId: user.id, email: user.email },
        status: 'failure',
        metadata: {
          resource: ctx.resource,
          action: ctx.action,
          reason: failed?.reason,
        },
      });
      throw new ForbiddenAppException(failed?.reason ?? 'Authorization failed');
    }

    return true;
  }

  private async buildContext(
    request: Request & { user?: AuthenticatedUser },
    user: AuthenticatedUser,
    resourceMeta: ResourceMetadata | undefined,
    resourceData: Record<string, unknown> | null,
  ): Promise<AuthorizationContext> {
    const snapshot: RequestSnapshot = {
      ip: extractClientIp(request) ?? null,
      userAgent: extractUserAgent(request) ?? null,
      method: request.method ?? null,
      path: request.path ?? null,
      headers: this.normalizeHeaders(request.headers),
    };

    const attributes = await this.authorizationService.resolveAttributes(user);
    const permissions =
      user.organizationId && user.membershipId
        ? await this.permissionService.resolveForMembership(
            user.id,
            user.organizationId,
            user.membershipId,
          )
        : [];
    const policies =
      user.organizationId && user.membershipId
        ? await this.policyService.resolveForMembership(
            user.id,
            user.organizationId,
            user.membershipId,
          )
        : [];

    return {
      user,
      resource: resourceMeta?.resourceType ?? 'unknown',
      action: 'access',
      organizationId: user.organizationId,
      resourceData,
      request: snapshot,
      attributes,
      permissions,
      policies,
    };
  }

  private evaluatePolicyBySlug(slug: string, ctx: AuthorizationContext): AuthorizationDecision {
    const policy = ctx.policies.find((p) => p.slug === slug && p.isEnabled);
    if (!policy) {
      return {
        allowed: false,
        reason: `Required policy "${slug}" not found or disabled`,
        matchedPolicies: [],
        failedConditions: [],
      };
    }
    const failed: AuthorizationDecision['failedConditions'] = [];
    for (const condition of policy.conditions) {
      const result = this.conditionEvaluator.evaluate(condition, ctx);
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
        return {
          allowed: false,
          reason: `Policy "${slug}" condition failed`,
          matchedPolicies: [],
          failedConditions: failed,
        };
      }
    }
    return {
      allowed: policy.effect === 'ALLOW',
      reason: `Policy "${slug}" matched`,
      matchedPolicies: [{ id: policy.id, name: policy.name, effect: policy.effect }],
      failedConditions: failed,
    };
  }

  private evaluateInlineAttributes(
    requirements: InlineAttributeRequirement[],
    ctx: AuthorizationContext,
  ): AuthorizationDecision {
    const failed: AuthorizationDecision['failedConditions'] = [];
    for (const req of requirements) {
      const condition: SerializedPolicyCondition = {
        id: 'inline',
        attributeSource: req.source,
        attributePath: req.path,
        operator: req.operator,
        value: req.compareWith ?? req.value,
        valueType: 'STRING' as never,
      };
      const result = this.conditionEvaluator.evaluate(condition, ctx);
      if (!result.passed) {
        failed.push({
          policyId: 'inline',
          conditionId: 'inline',
          attributeSource: req.source,
          attributePath: req.path,
          operator: req.operator,
          actualValue: result.actual,
          expectedValue: result.expected,
        });
        return {
          allowed: false,
          reason: 'Inline attribute requirement failed',
          matchedPolicies: [],
          failedConditions: failed,
        };
      }
    }
    return {
      allowed: true,
      reason: 'Inline attribute requirements satisfied',
      matchedPolicies: [],
      failedConditions: [],
    };
  }

  private evaluateOwnership(
    requirement: OwnershipRequirement,
    user: AuthenticatedUser,
    resourceData: Record<string, unknown> | null,
  ): AuthorizationDecision {
    if (!resourceData) {
      return {
        allowed: false,
        reason: 'Resource could not be loaded for ownership check',
        matchedPolicies: [],
        failedConditions: [],
      };
    }
    const ownerId = resourceData[requirement.ownerField ?? 'ownerId'];
    const allowed = ownerId === user.id;
    return {
      allowed,
      reason: allowed ? 'Caller owns the resource' : 'Caller does not own the resource',
      matchedPolicies: [],
      failedConditions: allowed
        ? []
        : [
            {
              policyId: 'ownership',
              conditionId: 'ownership',
              attributeSource: AttributeSource.RESOURCE,
              attributePath: requirement.ownerField ?? 'ownerId',
              operator: PolicyOperator.EQUALS,
              actualValue: ownerId,
              expectedValue: user.id,
            },
          ],
    };
  }

  private async loadResource(
    request: Request,
    meta: ResourceMetadata | OwnershipRequirement | undefined,
    user: AuthenticatedUser,
  ): Promise<Record<string, unknown> | null> {
    if (!meta) {
      return null;
    }
    const id = this.extractResourceId(request, meta);
    if (!id) {
      return null;
    }
    return this.resourceLoaders.load(meta.resourceType, id, {
      user,
      organizationId: user.organizationId,
    });
  }

  private extractResourceId(
    request: Request,
    meta: ResourceMetadata | OwnershipRequirement | undefined,
  ): string | undefined {
    if (!meta) {
      return undefined;
    }
    const paramName = 'paramName' in meta && meta.paramName ? meta.paramName : 'id';
    const params = (request.params ?? {}) as Record<string, string | undefined>;
    return params[paramName];
  }

  private normalizeHeaders(headers: Request['headers']): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(headers)) {
      out[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : v;
    }
    return out;
  }
}
