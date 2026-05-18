import { Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '@infrastructure/database';

import { type ResourceLoader } from '../interfaces/resource-loader.interface';
import { ResourceLoaderRegistry } from '../services/resource-loader.registry';

@Injectable()
export class DefaultResourceLoaders implements OnModuleInit {
  constructor(
    private readonly registry: ResourceLoaderRegistry,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.userLoader());
    this.registry.register(this.organizationLoader());
    this.registry.register(this.membershipLoader());
    this.registry.register(this.policyLoader());
  }

  private userLoader(): ResourceLoader {
    return {
      resourceType: 'user',
      load: async (id, ctx) => {
        const user = await this.prisma.user.findFirst({
          where: { id, deletedAt: null },
          include: {
            memberships: {
              where: ctx.organizationId
                ? { organizationId: ctx.organizationId, deletedAt: null }
                : { deletedAt: null },
              take: 1,
            },
          },
        });
        if (!user) {
          return null;
        }
        if (ctx.organizationId && user.memberships.length === 0) {
          return null;
        }
        const m = user.memberships[0];
        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          status: user.status,
          ownerId: user.id,
          organizationId: m?.organizationId ?? null,
          department: m?.department ?? null,
          region: m?.region ?? null,
          clearanceLevel: m?.clearanceLevel ?? 0,
        };
      },
    };
  }

  private organizationLoader(): ResourceLoader {
    return {
      resourceType: 'organization',
      load: async (id, ctx) => {
        const org = await this.prisma.organization.findFirst({
          where: {
            id,
            deletedAt: null,
            ...(ctx.organizationId ? { id: ctx.organizationId } : {}),
          },
        });
        if (!org) {
          return null;
        }
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          status: org.status,
          plan: org.plan,
          settings: org.settings,
          organizationId: org.id,
        };
      },
    };
  }

  private membershipLoader(): ResourceLoader {
    return {
      resourceType: 'membership',
      load: async (id, ctx) => {
        const membership = await this.prisma.membership.findFirst({
          where: {
            id,
            deletedAt: null,
            ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
          },
        });
        if (!membership) {
          return null;
        }
        return {
          id: membership.id,
          userId: membership.userId,
          ownerId: membership.userId,
          organizationId: membership.organizationId,
          status: membership.status,
          department: membership.department,
          region: membership.region,
          jobTitle: membership.jobTitle,
          clearanceLevel: membership.clearanceLevel,
        };
      },
    };
  }

  private policyLoader(): ResourceLoader {
    return {
      resourceType: 'policy',
      load: async (id, ctx) => {
        const policy = await this.prisma.policy.findFirst({
          where: {
            id,
            deletedAt: null,
            OR: ctx.organizationId
              ? [{ organizationId: ctx.organizationId }, { organizationId: null }]
              : [{ organizationId: null }],
          },
        });
        if (!policy) {
          return null;
        }
        return {
          id: policy.id,
          name: policy.name,
          slug: policy.slug,
          organizationId: policy.organizationId,
          effect: policy.effect,
          resource: policy.resource,
          action: policy.action,
        };
      },
    };
  }
}
