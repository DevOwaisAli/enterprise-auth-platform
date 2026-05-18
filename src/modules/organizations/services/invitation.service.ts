import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvitationStatus, MembershipStatus, type OrganizationInvitation } from '@prisma/client';

import { AppException } from '@common/exceptions';
import { type AppConfig, APP_CONFIG_KEY } from '@config/app.config';
import { PrismaService } from '@infrastructure/database';
import { MailJobType, type OrganizationInvitationJobData } from '@infrastructure/mail';
import { QUEUE_NAMES, QueueService } from '@infrastructure/queue';
import { AuditAction, AuditResource, AuditService } from '@modules/audit';
import { generateSecureToken, hashToken } from '@modules/auth/utils';

import { INVITATION_TTL_MS, ORG_ERROR_CODES } from '../constants';
import { type CreateInvitationDto } from '../dto';

@Injectable()
export class InvitationService {
  private readonly appConfig: AppConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly queueService: QueueService,
    configService: ConfigService,
  ) {
    this.appConfig = configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);
  }

  async create(
    organizationId: string,
    dto: CreateInvitationDto,
    actorUserId: string,
  ): Promise<{ invitation: OrganizationInvitation; rawToken: string }> {
    const email = dto.email.trim().toLowerCase();

    if (dto.roleId) {
      const role = await this.prisma.role.findFirst({
        where: {
          id: dto.roleId,
          deletedAt: null,
          OR: [{ organizationId }, { organizationId: null }],
        },
      });
      if (!role) {
        throw new AppException({
          code: ORG_ERROR_CODES.ROLE_NOT_FOUND,
          message: 'Role not found in organization scope',
          status: 404,
        });
      }
    }

    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const invitation = await this.prisma.organizationInvitation.create({
      data: {
        organizationId,
        email,
        roleId: dto.roleId ?? null,
        department: dto.department ?? null,
        region: dto.region ?? null,
        jobTitle: dto.jobTitle ?? null,
        clearanceLevel: dto.clearanceLevel ?? 0,
        tokenHash,
        expiresAt,
      },
    });

    await this.auditService.record({
      action: AuditAction.ORG_INVITATION_CREATED,
      resource: AuditResource.INVITATION,
      resourceId: invitation.id,
      actor: { userId: actorUserId },
      metadata: { organizationId, email },
    });

    await this.enqueueInvitationEmail(invitation, rawToken);

    return { invitation, rawToken };
  }

  async list(organizationId: string): Promise<OrganizationInvitation[]> {
    return this.prisma.organizationInvitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revoke(id: string, organizationId: string, actorUserId: string): Promise<void> {
    const invitation = await this.prisma.organizationInvitation.findFirst({
      where: { id, organizationId },
    });
    if (!invitation) {
      throw new AppException({
        code: ORG_ERROR_CODES.INVITATION_NOT_FOUND,
        message: 'Invitation not found',
        status: 404,
      });
    }
    if (invitation.status !== InvitationStatus.PENDING) {
      return;
    }
    await this.prisma.organizationInvitation.update({
      where: { id },
      data: { status: InvitationStatus.REVOKED },
    });
    await this.auditService.record({
      action: AuditAction.ORG_INVITATION_REVOKED,
      resource: AuditResource.INVITATION,
      resourceId: id,
      actor: { userId: actorUserId },
    });
  }

  async accept(
    rawToken: string,
    acceptingUserId: string,
    acceptingEmail: string,
  ): Promise<{ organizationId: string; membershipId: string }> {
    const tokenHash = hashToken(rawToken);
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.organizationInvitation.findUnique({ where: { tokenHash } });
      if (!invitation) {
        throw new AppException({
          code: ORG_ERROR_CODES.INVITATION_INVALID_TOKEN,
          message: 'Invalid invitation token',
          status: 400,
        });
      }
      if (invitation.status === InvitationStatus.ACCEPTED) {
        throw new AppException({
          code: ORG_ERROR_CODES.INVITATION_ALREADY_ACCEPTED,
          message: 'Invitation already accepted',
          status: 409,
        });
      }
      if (invitation.status === InvitationStatus.REVOKED) {
        throw new AppException({
          code: ORG_ERROR_CODES.INVITATION_REVOKED,
          message: 'Invitation has been revoked',
          status: 410,
        });
      }
      if (
        invitation.expiresAt.getTime() <= Date.now() ||
        invitation.status === InvitationStatus.EXPIRED
      ) {
        await tx.organizationInvitation.update({
          where: { id: invitation.id },
          data: { status: InvitationStatus.EXPIRED },
        });
        throw new AppException({
          code: ORG_ERROR_CODES.INVITATION_EXPIRED,
          message: 'Invitation has expired',
          status: 410,
        });
      }
      if (invitation.email !== acceptingEmail.toLowerCase()) {
        throw new AppException({
          code: ORG_ERROR_CODES.INVITATION_EMAIL_MISMATCH,
          message: 'Invitation email does not match the authenticated user',
          status: 403,
        });
      }

      const existing = await tx.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: acceptingUserId,
            organizationId: invitation.organizationId,
          },
        },
      });

      let membership = existing;
      if (membership) {
        membership = await tx.membership.update({
          where: { id: membership.id },
          data: {
            status: MembershipStatus.ACTIVE,
            department: invitation.department,
            region: invitation.region,
            jobTitle: invitation.jobTitle,
            clearanceLevel: invitation.clearanceLevel,
            deletedAt: null,
            attributesVersion: { increment: 1 },
          },
        });
      } else {
        membership = await tx.membership.create({
          data: {
            userId: acceptingUserId,
            organizationId: invitation.organizationId,
            department: invitation.department,
            region: invitation.region,
            jobTitle: invitation.jobTitle,
            clearanceLevel: invitation.clearanceLevel,
          },
        });
      }

      if (invitation.roleId) {
        await tx.userRole.upsert({
          where: {
            membershipId_roleId: { membershipId: membership.id, roleId: invitation.roleId },
          },
          create: { membershipId: membership.id, roleId: invitation.roleId },
          update: {},
        });
        await tx.membership.update({
          where: { id: membership.id },
          data: { permissionsVersion: { increment: 1 } },
        });
      }

      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
      });

      await this.auditService.record({
        action: AuditAction.ORG_INVITATION_ACCEPTED,
        resource: AuditResource.INVITATION,
        resourceId: invitation.id,
        actor: { userId: acceptingUserId },
        metadata: { organizationId: invitation.organizationId },
      });

      return { organizationId: invitation.organizationId, membershipId: membership.id };
    });
  }

  private async enqueueInvitationEmail(
    invitation: OrganizationInvitation,
    rawToken: string,
  ): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: invitation.organizationId },
    });
    const payload: OrganizationInvitationJobData = {
      to: invitation.email,
      organizationName: org?.name ?? 'Organization',
      acceptUrl: `${this.appConfig.appUrl}/organizations/invitations/accept?token=${encodeURIComponent(rawToken)}`,
      expiresAt: invitation.expiresAt.toISOString(),
    };
    await this.queueService.enqueue(QUEUE_NAMES.EMAIL, MailJobType.ORG_INVITATION, payload);
  }
}
