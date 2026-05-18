import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AuthenticatedUser } from '@common/decorators/current-user.decorator';
import { Environment } from '@common/enums';
import { CacheService } from '@infrastructure/cache';
import { PrismaService } from '@infrastructure/database';
import { AUTH_CACHE_KEYS, AUTHZ_CACHE_TTL_SECONDS } from '@modules/auth/constants';

import {
  type AuthorizationContext,
  type AuthorizationDecision,
  type RequestSnapshot,
  type ResolvedAttributes,
} from '../interfaces';

import { PermissionService } from './permission.service';
import { PolicyEvaluatorService } from './policy-evaluator.service';
import { PolicyService } from './policy.service';

export interface EvaluateInput {
  user: AuthenticatedUser;
  resource: string;
  action: string;
  resourceId?: string;
  resourceData?: Record<string, unknown> | null;
  request: RequestSnapshot;
}

@Injectable()
export class AuthorizationService {
  private readonly isDevelopment: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly permissionService: PermissionService,
    private readonly policyService: PolicyService,
    private readonly policyEvaluator: PolicyEvaluatorService,
    configService: ConfigService,
  ) {
    this.isDevelopment = configService.get<string>('NODE_ENV') === Environment.Development;
  }

  async evaluate(input: EvaluateInput): Promise<AuthorizationDecision> {
    const { user } = input;
    if (!user.organizationId || !user.membershipId) {
      return {
        allowed: false,
        reason: 'No active organization context',
        matchedPolicies: [],
        failedConditions: [],
      };
    }

    const permissions = await this.permissionService.resolveForMembership(
      user.id,
      user.organizationId,
      user.membershipId,
    );
    const policies = await this.policyService.resolveForMembership(
      user.id,
      user.organizationId,
      user.membershipId,
    );
    const attributes = await this.resolveAttributes(user);

    const context: AuthorizationContext = {
      user,
      resource: input.resource,
      action: input.action,
      organizationId: user.organizationId,
      resourceData: input.resourceData ?? null,
      resourceId: input.resourceId,
      request: input.request,
      attributes,
      permissions,
      policies,
    };

    // RBAC first
    const rbacAllow = this.permissionService.hasPermission(
      permissions,
      input.resource,
      input.action,
    );

    // ABAC always evaluated so DENY can override
    const abac = this.policyEvaluator.evaluate(context);

    // DENY overrides everything
    if (abac.matchedPolicies.some((p) => p.effect === 'DENY')) {
      return this.sanitize(abac);
    }

    if (rbacAllow) {
      return this.sanitize({
        allowed: true,
        reason: 'Granted by RBAC permission',
        matchedPolicies: abac.matchedPolicies,
        failedConditions: abac.failedConditions,
      });
    }

    return this.sanitize(abac);
  }

  async resolveAttributes(user: AuthenticatedUser): Promise<ResolvedAttributes> {
    if (!user.organizationId || !user.membershipId) {
      return { user: {}, membership: {}, organization: {} };
    }
    const cacheKey = AUTH_CACHE_KEYS.attributes(user.id, user.organizationId);
    return this.cache.getOrSet<ResolvedAttributes>(
      cacheKey,
      async () => {
        const membership = await this.prisma.membership.findFirst({
          where: { id: user.membershipId ?? undefined, deletedAt: null },
          include: {
            user: true,
            organization: true,
          },
        });
        if (!membership) {
          return { user: {}, membership: {}, organization: {} };
        }
        return {
          user: {
            id: membership.user.id,
            email: membership.user.email,
            firstName: membership.user.firstName,
            lastName: membership.user.lastName,
            status: membership.user.status,
            isEmailVerified: membership.user.isEmailVerified,
          },
          membership: {
            id: membership.id,
            status: membership.status,
            department: membership.department,
            region: membership.region,
            jobTitle: membership.jobTitle,
            clearanceLevel: membership.clearanceLevel,
            joinedAt: membership.joinedAt,
            roles: user.roles,
          },
          organization: {
            id: membership.organization.id,
            name: membership.organization.name,
            slug: membership.organization.slug,
            status: membership.organization.status,
            plan: membership.organization.plan,
            settings: membership.organization.settings,
          },
        };
      },
      { ttlSeconds: AUTHZ_CACHE_TTL_SECONDS },
    );
  }

  private sanitize(decision: AuthorizationDecision): AuthorizationDecision {
    if (this.isDevelopment) {
      return decision;
    }
    return {
      allowed: decision.allowed,
      reason: decision.allowed ? decision.reason : 'Access denied',
      matchedPolicies: [],
      failedConditions: [],
    };
  }
}
