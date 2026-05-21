import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { MembershipStatus, type Prisma, type User, UserStatus } from '@prisma/client';

import { PrismaService } from '@infrastructure/database';
import { AuditAction, AuditResource, AuditService } from '@modules/audit';
import { PasswordService } from '@modules/auth/services/password.service';

export interface MappedSamlAttributes {
  email: string;
  firstName: string | null;
  lastName: string | null;
  department: string | null;
  jobTitle: string | null;
  groups: string[];
}

@Injectable()
export class JitProvisioningService {
  private readonly logger = new Logger(JitProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
  ) {}

  async provision(
    organizationId: string,
    attrs: MappedSamlAttributes,
    defaultRoleSlug: string | null,
  ): Promise<User> {
    const email = attrs.email.trim().toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email } });
      let isNewUser = false;

      if (!user) {
        const randomPassword = `!sso:${randomBytes(24).toString('hex')}`;
        const passwordHash = await this.passwordService.hash(randomPassword);
        user = await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName: attrs.firstName,
            lastName: attrs.lastName,
            isEmailVerified: true,
            status: UserStatus.ACTIVE,
          },
        });
        isNewUser = true;
      } else if (user.status !== UserStatus.ACTIVE && !user.deletedAt) {
        // Reactivate previously provisioned users on valid SSO login.
        user = await tx.user.update({
          where: { id: user.id },
          data: { status: UserStatus.ACTIVE },
        });
      }

      const membership = await tx.membership.upsert({
        where: { userId_organizationId: { userId: user.id, organizationId } },
        create: {
          userId: user.id,
          organizationId,
          status: MembershipStatus.ACTIVE,
          department: attrs.department,
          jobTitle: attrs.jobTitle,
        },
        update: {
          status: MembershipStatus.ACTIVE,
          department: attrs.department ?? undefined,
          jobTitle: attrs.jobTitle ?? undefined,
        },
      });

      await this.assignRoles(tx, membership.id, organizationId, defaultRoleSlug, attrs.groups);

      await this.auditService.record({
        action: AuditAction.SSO_JIT_PROVISIONED,
        resource: AuditResource.MEMBERSHIP,
        resourceId: membership.id,
        actor: { userId: user.id, email: user.email },
        metadata: {
          organizationId,
          isNewUser,
          department: attrs.department,
          jobTitle: attrs.jobTitle,
          groups: attrs.groups,
        },
      });

      return user;
    });
  }

  private async assignRoles(
    tx: Prisma.TransactionClient,
    membershipId: string,
    organizationId: string,
    defaultRoleSlug: string | null,
    groups: string[],
  ): Promise<void> {
    const slugs = new Set<string>();
    if (defaultRoleSlug) {
      slugs.add(defaultRoleSlug);
    }
    for (const group of groups) {
      slugs.add(group.trim().toLowerCase().replace(/\s+/g, '-'));
    }
    if (slugs.size === 0) {
      return;
    }

    const roles = await tx.role.findMany({
      where: {
        slug: { in: Array.from(slugs) },
        deletedAt: null,
        OR: [{ organizationId }, { organizationId: null }],
      },
    });

    for (const role of roles) {
      await tx.userRole.upsert({
        where: { membershipId_roleId: { membershipId, roleId: role.id } },
        create: { membershipId, roleId: role.id },
        update: {},
      });
    }

    const missing = Array.from(slugs).filter((slug) => !roles.some((r) => r.slug === slug));
    if (missing.length > 0) {
      this.logger.debug(`JIT: skipped unknown role slugs ${missing.join(', ')}`);
    }
  }
}
