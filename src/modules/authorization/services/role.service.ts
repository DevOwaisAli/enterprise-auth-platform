import { Injectable } from '@nestjs/common';
import { type Role } from '@prisma/client';

import { AppException, NotFoundAppException } from '@common/exceptions';
import { PrismaService } from '@infrastructure/database';
import { AuditAction, AuditResource, AuditService } from '@modules/audit';
import { MembershipService } from '@modules/organizations';

import { AUTHZ_ERROR_CODES } from '../constants';
import { type CreateRoleDto, type SetRolePermissionsDto, type UpdateRoleDto } from '../dto';

import { PermissionService } from './permission.service';

@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly permissionService: PermissionService,
    private readonly membershipService: MembershipService,
  ) {}

  async create(
    organizationId: string | null,
    dto: CreateRoleDto,
    actorUserId: string,
  ): Promise<Role> {
    const existing = await this.prisma.role.findFirst({
      where: { organizationId, slug: dto.slug, deletedAt: null },
    });
    if (existing) {
      throw new AppException({
        code: AUTHZ_ERROR_CODES.ROLE_SLUG_TAKEN,
        message: 'Role slug already exists in this scope',
        status: 409,
      });
    }

    const role = await this.prisma.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          organizationId,
          name: dto.name,
          slug: dto.slug,
          description: dto.description ?? null,
        },
      });
      if (dto.permissionIds && dto.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({
            roleId: created.id,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }
      return created;
    });

    await this.auditService.record({
      action: AuditAction.ROLE_CREATED,
      resource: AuditResource.ROLE,
      resourceId: role.id,
      actor: { userId: actorUserId },
      metadata: { organizationId, slug: role.slug },
    });

    return role;
  }

  async list(organizationId: string | null): Promise<Role[]> {
    return this.prisma.role.findMany({
      where: {
        deletedAt: null,
        OR: organizationId
          ? [{ organizationId }, { organizationId: null }]
          : [{ organizationId: null }],
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async findById(id: string): Promise<Role> {
    const role = await this.prisma.role.findFirst({ where: { id, deletedAt: null } });
    if (!role) {
      throw new NotFoundAppException('Role not found');
    }
    return role;
  }

  async update(id: string, dto: UpdateRoleDto, actorUserId: string): Promise<Role> {
    const existing = await this.findById(id);
    if (existing.isSystem) {
      throw new AppException({
        code: AUTHZ_ERROR_CODES.PERMISSION_DENIED,
        message: 'System roles cannot be updated',
        status: 403,
      });
    }
    const updated = await this.prisma.role.update({
      where: { id },
      data: { name: dto.name ?? undefined, description: dto.description ?? undefined },
    });
    await this.auditService.record({
      action: AuditAction.ROLE_UPDATED,
      resource: AuditResource.ROLE,
      resourceId: id,
      actor: { userId: actorUserId },
    });
    return updated;
  }

  async remove(id: string, actorUserId: string): Promise<void> {
    const role = await this.findById(id);
    if (role.isSystem) {
      throw new AppException({
        code: AUTHZ_ERROR_CODES.PERMISSION_DENIED,
        message: 'System roles cannot be deleted',
        status: 403,
      });
    }
    await this.prisma.role.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.membershipService.bumpPermissionsVersionForRole(id);
    await this.permissionService.invalidateForRole(id);
    await this.auditService.record({
      action: AuditAction.ROLE_DELETED,
      resource: AuditResource.ROLE,
      resourceId: id,
      actor: { userId: actorUserId },
    });
  }

  async setPermissions(
    roleId: string,
    dto: SetRolePermissionsDto,
    actorUserId: string,
  ): Promise<void> {
    await this.findById(roleId);
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (dto.permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({ roleId, permissionId })),
          skipDuplicates: true,
        });
      }
    });
    await this.membershipService.bumpPermissionsVersionForRole(roleId);
    await this.permissionService.invalidateForRole(roleId);
    await this.auditService.record({
      action: AuditAction.ROLE_UPDATED,
      resource: AuditResource.ROLE,
      resourceId: roleId,
      actor: { userId: actorUserId },
      metadata: { permissionsCount: dto.permissionIds.length },
    });
  }

  async assignToMembership(
    organizationId: string,
    membershipId: string,
    roleId: string,
    actorUserId: string,
  ): Promise<void> {
    const role = await this.findById(roleId);
    if (role.organizationId && role.organizationId !== organizationId) {
      throw new AppException({
        code: AUTHZ_ERROR_CODES.ROLE_NOT_FOUND,
        message: 'Role belongs to a different organization',
        status: 404,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.upsert({
        where: { membershipId_roleId: { membershipId, roleId } },
        create: { membershipId, roleId },
        update: {},
      });
      await tx.membership.update({
        where: { id: membershipId },
        data: { permissionsVersion: { increment: 1 } },
      });
    });
    const membership = await this.prisma.membership.findUnique({ where: { id: membershipId } });
    if (membership) {
      await this.permissionService.invalidateForUser(membership.userId, organizationId);
    }
    await this.auditService.record({
      action: AuditAction.ROLE_ASSIGNED,
      resource: AuditResource.ROLE,
      resourceId: roleId,
      actor: { userId: actorUserId },
      metadata: { membershipId, organizationId },
    });
  }

  async revokeFromMembership(
    organizationId: string,
    membershipId: string,
    roleId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { membershipId, roleId } });
      await tx.membership.update({
        where: { id: membershipId },
        data: { permissionsVersion: { increment: 1 } },
      });
    });
    const membership = await this.prisma.membership.findUnique({ where: { id: membershipId } });
    if (membership) {
      await this.permissionService.invalidateForUser(membership.userId, organizationId);
    }
    await this.auditService.record({
      action: AuditAction.ROLE_REVOKED,
      resource: AuditResource.ROLE,
      resourceId: roleId,
      actor: { userId: actorUserId },
      metadata: { membershipId, organizationId },
    });
  }
}
