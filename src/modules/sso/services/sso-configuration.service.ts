import { Injectable } from '@nestjs/common';
import { type Prisma, type SsoConfiguration } from '@prisma/client';

import { AppException, NotFoundAppException } from '@common/exceptions';
import { PrismaService } from '@infrastructure/database';
import { AuditAction, AuditResource, AuditService } from '@modules/audit';
import { SecretsCryptoService } from '@modules/mfa/services';

import { DEFAULT_ATTRIBUTE_MAPPING, SSO_ERROR_CODES } from '../constants';
import {
  type CreateSsoConfigurationDto,
  type SsoConfigurationResponseDto,
  type UpdateSsoConfigurationDto,
} from '../dto';

@Injectable()
export class SsoConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsCrypto: SecretsCryptoService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreateSsoConfigurationDto,
    actorUserId: string,
  ): Promise<SsoConfigurationResponseDto> {
    const org = await this.prisma.organization.findFirst({
      where: { id: dto.organizationId, deletedAt: null },
    });
    if (!org) {
      throw new AppException({
        code: SSO_ERROR_CODES.SSO_ORG_NOT_FOUND,
        message: 'Organization not found',
        status: 404,
      });
    }

    this.validateCertificate(dto.certificate);

    const created = await this.prisma.ssoConfiguration.create({
      data: {
        organizationId: dto.organizationId,
        providerName: dto.providerName,
        entryPoint: dto.entryPoint,
        issuer: dto.issuer,
        certificate: this.secretsCrypto.encrypt(dto.certificate),
        metadataUrl: dto.metadataUrl,
        isEnabled: dto.isEnabled ?? false,
        allowIdpInitiated: dto.allowIdpInitiated ?? false,
        ssoOnlyMode: dto.ssoOnlyMode ?? false,
        attributeMapping: (dto.attributeMapping ??
          DEFAULT_ATTRIBUTE_MAPPING) as Prisma.InputJsonValue,
        defaultRoleSlug: dto.defaultRoleSlug,
      },
    });

    await this.auditService.record({
      action: AuditAction.SSO_CONFIG_CREATED,
      resource: AuditResource.SSO_CONFIGURATION,
      resourceId: created.id,
      actor: { userId: actorUserId },
      metadata: { organizationId: dto.organizationId, providerName: dto.providerName },
    });

    return this.toResponse(created);
  }

  async findAllForOrganization(organizationId: string): Promise<SsoConfigurationResponseDto[]> {
    const configs = await this.prisma.ssoConfiguration.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return configs.map((c) => this.toResponse(c));
  }

  async update(
    id: string,
    dto: UpdateSsoConfigurationDto,
    actorUserId: string,
  ): Promise<SsoConfigurationResponseDto> {
    const existing = await this.prisma.ssoConfiguration.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundAppException('SSO configuration not found');
    }
    if (dto.certificate) {
      this.validateCertificate(dto.certificate);
    }

    const updated = await this.prisma.ssoConfiguration.update({
      where: { id },
      data: {
        providerName: dto.providerName ?? undefined,
        entryPoint: dto.entryPoint ?? undefined,
        issuer: dto.issuer ?? undefined,
        certificate: dto.certificate ? this.secretsCrypto.encrypt(dto.certificate) : undefined,
        metadataUrl: dto.metadataUrl ?? undefined,
        isEnabled: dto.isEnabled ?? undefined,
        allowIdpInitiated: dto.allowIdpInitiated ?? undefined,
        ssoOnlyMode: dto.ssoOnlyMode ?? undefined,
        attributeMapping: dto.attributeMapping
          ? (dto.attributeMapping as Prisma.InputJsonValue)
          : undefined,
        defaultRoleSlug: dto.defaultRoleSlug ?? undefined,
      },
    });

    await this.auditService.record({
      action: AuditAction.SSO_CONFIG_UPDATED,
      resource: AuditResource.SSO_CONFIGURATION,
      resourceId: id,
      actor: { userId: actorUserId },
    });

    return this.toResponse(updated);
  }

  async remove(id: string, actorUserId: string): Promise<void> {
    const existing = await this.prisma.ssoConfiguration.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundAppException('SSO configuration not found');
    }
    await this.prisma.ssoConfiguration.delete({ where: { id } });
    await this.auditService.record({
      action: AuditAction.SSO_CONFIG_DELETED,
      resource: AuditResource.SSO_CONFIGURATION,
      resourceId: id,
      actor: { userId: actorUserId },
    });
  }

  async getEnabledConfigForOrgSlug(slug: string): Promise<{
    config: SsoConfiguration;
    organizationId: string;
    decryptedCertificate: string;
  }> {
    const org = await this.prisma.organization.findFirst({
      where: { slug: slug.toLowerCase(), deletedAt: null },
    });
    if (!org) {
      throw new AppException({
        code: SSO_ERROR_CODES.SSO_ORG_NOT_FOUND,
        message: 'Organization not found',
        status: 404,
      });
    }
    const config = await this.prisma.ssoConfiguration.findFirst({
      where: { organizationId: org.id, isEnabled: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!config) {
      throw new AppException({
        code: SSO_ERROR_CODES.SSO_NOT_CONFIGURED,
        message: 'SSO is not configured or enabled for this organization',
        status: 404,
      });
    }
    return {
      config: { ...config, certificate: this.secretsCrypto.decrypt(config.certificate) },
      organizationId: org.id,
      decryptedCertificate: this.secretsCrypto.decrypt(config.certificate),
    };
  }

  async isSsoOnlyForUser(userId: string): Promise<boolean> {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, deletedAt: null },
      select: { organizationId: true },
    });
    if (memberships.length === 0) {
      return false;
    }
    const count = await this.prisma.ssoConfiguration.count({
      where: {
        organizationId: { in: memberships.map((m) => m.organizationId) },
        isEnabled: true,
        ssoOnlyMode: true,
      },
    });
    return count > 0;
  }

  private validateCertificate(certificate: string): void {
    const trimmed = certificate.trim();
    if (trimmed.length < 64) {
      throw new AppException({
        code: SSO_ERROR_CODES.SSO_INVALID_METADATA,
        message: 'Certificate appears invalid (too short)',
        status: 400,
      });
    }
  }

  private toResponse(config: SsoConfiguration): SsoConfigurationResponseDto {
    return {
      id: config.id,
      organizationId: config.organizationId,
      providerName: config.providerName,
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      metadataUrl: config.metadataUrl,
      isEnabled: config.isEnabled,
      allowIdpInitiated: config.allowIdpInitiated,
      ssoOnlyMode: config.ssoOnlyMode,
      attributeMapping: (config.attributeMapping ?? {}) as Record<string, string>,
      defaultRoleSlug: config.defaultRoleSlug,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}
