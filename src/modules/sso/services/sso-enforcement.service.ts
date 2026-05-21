import { Injectable, type OnModuleInit } from '@nestjs/common';
import { type User } from '@prisma/client';

import { PrismaService } from '@infrastructure/database';
import { LoginHooksService } from '@modules/auth/services/login-hooks.service';

import { SsoConfigurationService } from './sso-configuration.service';

const SUPER_ADMIN_SLUGS = ['super-admin', 'superadmin'];

@Injectable()
export class SsoEnforcementService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ssoConfigService: SsoConfigurationService,
    private readonly loginHooks: LoginHooksService,
  ) {}

  onModuleInit(): void {
    this.loginHooks.registerSsoEnforcement(async (user) => this.evaluate(user));
  }

  private async evaluate(user: User): Promise<{ blocked: boolean; reason?: string }> {
    const ssoOnly = await this.ssoConfigService.isSsoOnlyForUser(user.id);
    if (!ssoOnly) {
      return { blocked: false };
    }
    // Super-admins retain password login as a break-glass mechanism.
    if (await this.isSuperAdmin(user.id)) {
      return { blocked: false };
    }
    return {
      blocked: true,
      reason: 'Your organization enforces SSO-only login. Use the SSO portal to sign in.',
    };
  }

  private async isSuperAdmin(userId: string): Promise<boolean> {
    const count = await this.prisma.userRole.count({
      where: {
        membership: { userId, deletedAt: null },
        role: { slug: { in: SUPER_ADMIN_SLUGS }, deletedAt: null },
      },
    });
    return count > 0;
  }
}
