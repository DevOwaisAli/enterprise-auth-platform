import { Injectable } from '@nestjs/common';
import { MembershipStatus, OrganizationStatus } from '@prisma/client';

import { PrismaService } from '@infrastructure/database';

export interface ActiveOrgContext {
  organizationId: string | null;
  membershipId: string | null;
  roles: string[];
  permissionsVersion: number;
  attributesVersion: number;
}

@Injectable()
export class ActiveContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveDefault(userId: string): Promise<ActiveOrgContext> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        deletedAt: null,
        status: MembershipStatus.ACTIVE,
        organization: { deletedAt: null, status: OrganizationStatus.ACTIVE },
      },
      orderBy: { joinedAt: 'asc' },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
    if (!membership) {
      return this.empty();
    }
    return this.fromMembership(membership);
  }

  async resolveForOrganization(
    userId: string,
    organizationId: string,
  ): Promise<ActiveOrgContext | null> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        organizationId,
        deletedAt: null,
        status: MembershipStatus.ACTIVE,
        organization: { deletedAt: null, status: OrganizationStatus.ACTIVE },
      },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });
    if (!membership) {
      return null;
    }
    return this.fromMembership(membership);
  }

  private fromMembership(membership: {
    id: string;
    organizationId: string;
    permissionsVersion: number;
    attributesVersion: number;
    userRoles: Array<{ role: { slug: string; deletedAt: Date | null } }>;
  }): ActiveOrgContext {
    return {
      organizationId: membership.organizationId,
      membershipId: membership.id,
      roles: membership.userRoles
        .filter((ur) => ur.role.deletedAt === null)
        .map((ur) => ur.role.slug),
      permissionsVersion: membership.permissionsVersion,
      attributesVersion: membership.attributesVersion,
    };
  }

  private empty(): ActiveOrgContext {
    return {
      organizationId: null,
      membershipId: null,
      roles: [],
      permissionsVersion: 0,
      attributesVersion: 0,
    };
  }
}
