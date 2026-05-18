import { Injectable } from '@nestjs/common';
import { type Membership, MembershipStatus, type Prisma } from '@prisma/client';

import { AppException, NotFoundAppException } from '@common/exceptions';
import { PrismaService } from '@infrastructure/database';
import { AuditAction, AuditResource, AuditService } from '@modules/audit';

import { ORG_ERROR_CODES, SYSTEM_ROLE_SLUGS } from '../constants';
import { type UpdateMemberDto } from '../dto';

@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findById(membershipId: string, organizationId: string): Promise<Membership> {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId, deletedAt: null },
    });
    if (!membership) {
      throw new NotFoundAppException('Membership not found');
    }
    return membership;
  }

  async findByUserAndOrg(userId: string, organizationId: string): Promise<Membership | null> {
    return this.prisma.membership.findFirst({
      where: { userId, organizationId, deletedAt: null },
    });
  }

  async list(organizationId: string): Promise<
    Array<
      Membership & {
        user: { id: string; email: string; firstName: string | null; lastName: string | null };
      }
    >
  > {
    return this.prisma.membership.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async updateAttributes(
    organizationId: string,
    targetUserId: string,
    dto: UpdateMemberDto,
    actorUserId: string,
  ): Promise<Membership> {
    const membership = await this.findByUserAndOrgOrThrow(targetUserId, organizationId);

    const attributeChanged =
      dto.department !== undefined ||
      dto.region !== undefined ||
      dto.jobTitle !== undefined ||
      dto.clearanceLevel !== undefined;

    const data: Prisma.MembershipUpdateInput = {
      status: dto.status ?? undefined,
      department: dto.department ?? undefined,
      region: dto.region ?? undefined,
      jobTitle: dto.jobTitle ?? undefined,
      clearanceLevel: dto.clearanceLevel ?? undefined,
      ...(attributeChanged ? { attributesVersion: { increment: 1 } } : {}),
    };

    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data,
    });

    await this.auditService.record({
      action: AuditAction.ORG_MEMBER_UPDATED,
      resource: AuditResource.MEMBERSHIP,
      resourceId: updated.id,
      actor: { userId: actorUserId },
      metadata: { organizationId, targetUserId },
    });

    return updated;
  }

  async remove(organizationId: string, targetUserId: string, actorUserId: string): Promise<void> {
    const membership = await this.findByUserAndOrgOrThrow(targetUserId, organizationId);
    await this.ensureNotLastAdmin(organizationId, membership.id);

    await this.prisma.membership.update({
      where: { id: membership.id },
      data: { status: MembershipStatus.REMOVED, deletedAt: new Date() },
    });

    await this.auditService.record({
      action: AuditAction.ORG_MEMBER_REMOVED,
      resource: AuditResource.MEMBERSHIP,
      resourceId: membership.id,
      actor: { userId: actorUserId },
      metadata: { organizationId, targetUserId },
    });
  }

  async bumpPermissionsVersion(membershipId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.membership.update({
      where: { id: membershipId },
      data: { permissionsVersion: { increment: 1 } },
    });
  }

  async bumpPermissionsVersionForRole(
    roleId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const memberships = await client.membership.findMany({
      where: { userRoles: { some: { roleId } }, deletedAt: null },
      select: { id: true },
    });
    if (memberships.length === 0) {
      return;
    }
    await client.membership.updateMany({
      where: { id: { in: memberships.map((m) => m.id) } },
      data: { permissionsVersion: { increment: 1 } },
    });
  }

  async bumpAllVersionsForOrg(
    organizationId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.membership.updateMany({
      where: { organizationId, deletedAt: null },
      data: { permissionsVersion: { increment: 1 }, attributesVersion: { increment: 1 } },
    });
  }

  private async findByUserAndOrgOrThrow(
    userId: string,
    organizationId: string,
  ): Promise<Membership> {
    const membership = await this.findByUserAndOrg(userId, organizationId);
    if (!membership) {
      throw new AppException({
        code: ORG_ERROR_CODES.MEMBERSHIP_NOT_FOUND,
        message: 'Membership not found',
        status: 404,
      });
    }
    return membership;
  }

  private async ensureNotLastAdmin(organizationId: string, membershipId: string): Promise<void> {
    const adminCount = await this.prisma.userRole.count({
      where: {
        membership: { organizationId, deletedAt: null, status: MembershipStatus.ACTIVE },
        role: { slug: SYSTEM_ROLE_SLUGS.ADMIN, deletedAt: null },
      },
    });
    if (adminCount <= 1) {
      const isAdmin = await this.prisma.userRole.findFirst({
        where: { membershipId, role: { slug: SYSTEM_ROLE_SLUGS.ADMIN } },
      });
      if (isAdmin) {
        throw new AppException({
          code: ORG_ERROR_CODES.LAST_ADMIN_REMOVAL,
          message: 'Cannot remove the last admin from an organization',
          status: 409,
        });
      }
    }
  }
}
