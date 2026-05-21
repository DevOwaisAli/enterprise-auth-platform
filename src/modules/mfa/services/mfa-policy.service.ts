import { Injectable } from '@nestjs/common';
import { MembershipStatus, type Prisma } from '@prisma/client';

import { PrismaService } from '@infrastructure/database';

import { MfaChallengeMethod } from '../dto';

export interface OrganizationMfaSettings {
  requireMfa: boolean;
  allowBackupCodes: boolean;
  allowedMfaMethods: MfaChallengeMethod[];
}

export const DEFAULT_ORG_MFA_SETTINGS: OrganizationMfaSettings = {
  requireMfa: false,
  allowBackupCodes: true,
  allowedMfaMethods: [MfaChallengeMethod.TOTP, MfaChallengeMethod.BACKUP_CODE],
};

@Injectable()
export class MfaPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePolicyForUser(userId: string): Promise<OrganizationMfaSettings> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, deletedAt: null, status: MembershipStatus.ACTIVE },
      include: { organization: true },
    });

    const policies = memberships.map((m) => this.extractFromSettings(m.organization.settings));
    if (policies.length === 0) {
      return DEFAULT_ORG_MFA_SETTINGS;
    }

    return {
      requireMfa: policies.some((p) => p.requireMfa),
      allowBackupCodes: policies.every((p) => p.allowBackupCodes),
      allowedMfaMethods: this.intersectMethods(policies),
    };
  }

  async getPolicyForOrganization(organizationId: string): Promise<OrganizationMfaSettings> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) {
      return DEFAULT_ORG_MFA_SETTINGS;
    }
    return this.extractFromSettings(org.settings);
  }

  async updateOrganizationPolicy(
    organizationId: string,
    patch: Partial<OrganizationMfaSettings>,
  ): Promise<OrganizationMfaSettings> {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const current = this.extractFromSettings(org.settings);
    const next: OrganizationMfaSettings = {
      requireMfa: patch.requireMfa ?? current.requireMfa,
      allowBackupCodes: patch.allowBackupCodes ?? current.allowBackupCodes,
      allowedMfaMethods: patch.allowedMfaMethods ?? current.allowedMfaMethods,
    };
    const existingSettings =
      org.settings && typeof org.settings === 'object' && !Array.isArray(org.settings)
        ? (org.settings as Record<string, unknown>)
        : {};
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        settings: {
          ...existingSettings,
          mfa: next,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return next;
  }

  private extractFromSettings(raw: unknown): OrganizationMfaSettings {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return DEFAULT_ORG_MFA_SETTINGS;
    }
    const mfa = (raw as { mfa?: Partial<OrganizationMfaSettings> }).mfa;
    if (!mfa || typeof mfa !== 'object') {
      return DEFAULT_ORG_MFA_SETTINGS;
    }
    const allowedRaw = Array.isArray(mfa.allowedMfaMethods)
      ? (mfa.allowedMfaMethods as string[]).filter((value): value is MfaChallengeMethod =>
          (Object.values(MfaChallengeMethod) as string[]).includes(value),
        )
      : DEFAULT_ORG_MFA_SETTINGS.allowedMfaMethods;
    return {
      requireMfa: Boolean(mfa.requireMfa ?? DEFAULT_ORG_MFA_SETTINGS.requireMfa),
      allowBackupCodes: Boolean(mfa.allowBackupCodes ?? DEFAULT_ORG_MFA_SETTINGS.allowBackupCodes),
      allowedMfaMethods:
        allowedRaw.length > 0 ? allowedRaw : DEFAULT_ORG_MFA_SETTINGS.allowedMfaMethods,
    };
  }

  private intersectMethods(policies: OrganizationMfaSettings[]): MfaChallengeMethod[] {
    if (policies.length === 0) {
      return DEFAULT_ORG_MFA_SETTINGS.allowedMfaMethods;
    }
    return policies.reduce<MfaChallengeMethod[]>((acc, policy) => {
      if (acc.length === 0) {
        return [...policy.allowedMfaMethods];
      }
      return acc.filter((method) => policy.allowedMfaMethods.includes(method));
    }, []);
  }
}
