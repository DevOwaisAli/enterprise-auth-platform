import { Injectable } from '@nestjs/common';

import { AppException, NotFoundAppException } from '@common/exceptions';
import { CacheService } from '@infrastructure/cache';
import { PrismaService } from '@infrastructure/database';
import { AUTH_CACHE_KEYS, AUTHZ_CACHE_TTL_SECONDS } from '@modules/auth/constants';

import { AUTHZ_ERROR_CODES } from '../constants';
import { type CreatePermissionDto } from '../dto';
import { type ResolvedPermission } from '../interfaces';

@Injectable()
export class PermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async create(dto: CreatePermissionDto) {
    const existing = await this.prisma.permission.findUnique({
      where: { resource_action: { resource: dto.resource, action: dto.action } },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.permission.create({
      data: {
        resource: dto.resource,
        action: dto.action,
        description: dto.description ?? null,
      },
    });
  }

  async list() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async findById(id: string) {
    const permission = await this.prisma.permission.findUnique({ where: { id } });
    if (!permission) {
      throw new NotFoundAppException('Permission not found');
    }
    return permission;
  }

  async remove(id: string): Promise<void> {
    const usage = await this.prisma.rolePermission.count({ where: { permissionId: id } });
    if (usage > 0) {
      throw new AppException({
        code: AUTHZ_ERROR_CODES.PERMISSION_DENIED,
        message: 'Permission is in use by one or more roles',
        status: 409,
      });
    }
    await this.prisma.permission.delete({ where: { id } });
  }

  async resolveForMembership(
    userId: string,
    organizationId: string,
    membershipId: string,
  ): Promise<ResolvedPermission[]> {
    const cacheKey = AUTH_CACHE_KEYS.permissions(userId, organizationId);
    return this.cache.getOrSet<ResolvedPermission[]>(
      cacheKey,
      async () => {
        const rolePermissions = await this.prisma.rolePermission.findMany({
          where: {
            role: { deletedAt: null, userRoles: { some: { membershipId } } },
          },
          include: { permission: true },
        });
        const seen = new Set<string>();
        const result: ResolvedPermission[] = [];
        for (const rp of rolePermissions) {
          const key = `${rp.permission.resource}:${rp.permission.action}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          result.push({ resource: rp.permission.resource, action: rp.permission.action });
        }
        return result;
      },
      { ttlSeconds: AUTHZ_CACHE_TTL_SECONDS },
    );
  }

  async invalidateForUser(userId: string, organizationId: string): Promise<void> {
    await this.cache.delete(
      AUTH_CACHE_KEYS.permissions(userId, organizationId),
      AUTH_CACHE_KEYS.policies(userId, organizationId),
    );
  }

  async invalidateForRole(roleId: string): Promise<void> {
    const memberships = await this.prisma.membership.findMany({
      where: { userRoles: { some: { roleId } }, deletedAt: null },
      select: { userId: true, organizationId: true },
    });
    if (memberships.length === 0) {
      return;
    }
    const keys = memberships.flatMap((m) => [
      AUTH_CACHE_KEYS.permissions(m.userId, m.organizationId),
      AUTH_CACHE_KEYS.policies(m.userId, m.organizationId),
    ]);
    await this.cache.delete(...keys);
  }

  async invalidateForOrganization(organizationId: string): Promise<void> {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId, deletedAt: null },
      select: { userId: true },
    });
    if (memberships.length === 0) {
      return;
    }
    const keys = memberships.flatMap((m) => [
      AUTH_CACHE_KEYS.permissions(m.userId, organizationId),
      AUTH_CACHE_KEYS.policies(m.userId, organizationId),
      AUTH_CACHE_KEYS.attributes(m.userId, organizationId),
    ]);
    await this.cache.delete(...keys);
  }

  hasPermission(permissions: ResolvedPermission[], resource: string, action: string): boolean {
    return permissions.some(
      (p) =>
        (p.resource === resource || p.resource === '*') &&
        (p.action === action || p.action === '*'),
    );
  }
}
