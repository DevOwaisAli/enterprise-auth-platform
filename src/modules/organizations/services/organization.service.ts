import { Injectable } from '@nestjs/common';
import { type Organization, type Prisma } from '@prisma/client';

import { AppException, NotFoundAppException } from '@common/exceptions';
import { PrismaService } from '@infrastructure/database';
import { AuditAction, AuditResource, AuditService } from '@modules/audit';

import { ORG_ERROR_CODES, SYSTEM_ROLE_SLUGS } from '../constants';
import { type CreateOrganizationDto, type UpdateOrganizationDto } from '../dto';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(ownerUserId: string, dto: CreateOrganizationDto): Promise<Organization> {
    const slug = dto.slug.toLowerCase();
    const existing = await this.prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      throw new AppException({
        code: ORG_ERROR_CODES.ORG_SLUG_TAKEN,
        message: 'Slug is already taken',
        status: 409,
      });
    }

    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: dto.name,
          slug,
          status: dto.status ?? undefined,
          plan: dto.plan ?? undefined,
          settings: (dto.settings ?? {}) as Prisma.InputJsonValue,
        },
      });

      const adminRole = await tx.role.findFirst({
        where: { slug: SYSTEM_ROLE_SLUGS.ADMIN, organizationId: null, deletedAt: null },
      });

      const membership = await tx.membership.create({
        data: {
          userId: ownerUserId,
          organizationId: created.id,
        },
      });

      if (adminRole) {
        await tx.userRole.create({
          data: { membershipId: membership.id, roleId: adminRole.id },
        });
      }

      return created;
    });

    await this.auditService.record({
      action: AuditAction.ORG_CREATED,
      resource: AuditResource.ORGANIZATION,
      resourceId: org.id,
      actor: { userId: ownerUserId },
      metadata: { slug: org.slug, plan: org.plan },
    });

    return org;
  }

  async findAllForUser(userId: string): Promise<Organization[]> {
    return this.prisma.organization.findMany({
      where: {
        deletedAt: null,
        memberships: { some: { userId, deletedAt: null } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.prisma.organization.findFirst({ where: { id, deletedAt: null } });
    if (!org) {
      throw new NotFoundAppException('Organization not found');
    }
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    await this.findById(id);
    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        status: dto.status ?? undefined,
        plan: dto.plan ?? undefined,
        settings: dto.settings === undefined ? undefined : (dto.settings as Prisma.InputJsonValue),
      },
    });
    return updated;
  }

  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.findById(id);
    await this.prisma.organization.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.auditService.record({
      action: AuditAction.ORG_DELETED,
      resource: AuditResource.ORGANIZATION,
      resourceId: id,
      actor: { userId: actorUserId },
    });
  }
}
