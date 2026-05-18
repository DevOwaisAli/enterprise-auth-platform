import { Injectable } from '@nestjs/common';
import { type Policy, type PolicyAssignment, type Prisma } from '@prisma/client';

import { AppException, NotFoundAppException } from '@common/exceptions';
import { PrismaService } from '@infrastructure/database';
import { AuditAction, AuditResource, AuditService } from '@modules/audit';
import { MembershipService } from '@modules/organizations';

import { AUTHZ_ERROR_CODES } from '../constants';
import {
  type CreatePolicyAssignmentDto,
  type CreatePolicyConditionDto,
  type CreatePolicyDto,
  type UpdatePolicyConditionDto,
  type UpdatePolicyDto,
} from '../dto';
import { type SerializedPolicy } from '../interfaces';

import { PermissionService } from './permission.service';

@Injectable()
export class PolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly permissionService: PermissionService,
    private readonly membershipService: MembershipService,
  ) {}

  async create(dto: CreatePolicyDto, actorUserId: string): Promise<Policy> {
    const existing = await this.prisma.policy.findFirst({
      where: { organizationId: dto.organizationId ?? null, slug: dto.slug, deletedAt: null },
    });
    if (existing) {
      throw new AppException({
        code: AUTHZ_ERROR_CODES.POLICY_VALIDATION_FAILED,
        message: 'Policy slug already exists in this scope',
        status: 409,
      });
    }

    const policy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.policy.create({
        data: {
          organizationId: dto.organizationId ?? null,
          name: dto.name,
          slug: dto.slug,
          description: dto.description ?? null,
          effect: dto.effect,
          resource: dto.resource,
          action: dto.action,
          priority: dto.priority ?? 100,
          isEnabled: dto.isEnabled ?? true,
        },
      });
      if (dto.conditions && dto.conditions.length > 0) {
        await tx.policyCondition.createMany({
          data: dto.conditions.map((c) => this.conditionData(created.id, c)),
        });
      }
      return created;
    });

    await this.invalidateAfterPolicyChange(policy.organizationId);
    await this.auditService.record({
      action: AuditAction.POLICY_CREATED,
      resource: AuditResource.POLICY,
      resourceId: policy.id,
      actor: { userId: actorUserId },
      metadata: { organizationId: policy.organizationId, slug: policy.slug },
    });
    return policy;
  }

  async list(organizationId: string | null): Promise<Policy[]> {
    return this.prisma.policy.findMany({
      where: {
        deletedAt: null,
        OR: organizationId
          ? [{ organizationId }, { organizationId: null }]
          : [{ organizationId: null }],
      },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      include: { conditions: true },
    });
  }

  async findById(
    id: string,
  ): Promise<
    Policy & { conditions: Awaited<ReturnType<PrismaService['policyCondition']['findMany']>> }
  > {
    const policy = await this.prisma.policy.findFirst({
      where: { id, deletedAt: null },
      include: { conditions: true },
    });
    if (!policy) {
      throw new NotFoundAppException('Policy not found');
    }
    return policy;
  }

  async update(id: string, dto: UpdatePolicyDto, actorUserId: string): Promise<Policy> {
    const policy = await this.findById(id);
    if (policy.isSystem) {
      throw new AppException({
        code: AUTHZ_ERROR_CODES.POLICY_VALIDATION_FAILED,
        message: 'System policies cannot be modified',
        status: 403,
      });
    }
    const updated = await this.prisma.policy.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description ?? undefined,
        effect: dto.effect ?? undefined,
        priority: dto.priority ?? undefined,
        isEnabled: dto.isEnabled ?? undefined,
      },
    });
    await this.invalidateAfterPolicyChange(updated.organizationId);
    await this.auditService.record({
      action: AuditAction.POLICY_UPDATED,
      resource: AuditResource.POLICY,
      resourceId: id,
      actor: { userId: actorUserId },
    });
    return updated;
  }

  async remove(id: string, actorUserId: string): Promise<void> {
    const policy = await this.findById(id);
    if (policy.isSystem) {
      throw new AppException({
        code: AUTHZ_ERROR_CODES.POLICY_VALIDATION_FAILED,
        message: 'System policies cannot be deleted',
        status: 403,
      });
    }
    await this.prisma.policy.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.invalidateAfterPolicyChange(policy.organizationId);
    await this.auditService.record({
      action: AuditAction.POLICY_DELETED,
      resource: AuditResource.POLICY,
      resourceId: id,
      actor: { userId: actorUserId },
    });
  }

  async addCondition(policyId: string, dto: CreatePolicyConditionDto, actorUserId: string) {
    const policy = await this.findById(policyId);
    const created = await this.prisma.policyCondition.create({
      data: this.conditionData(policyId, dto),
    });
    await this.invalidateAfterPolicyChange(policy.organizationId);
    await this.auditService.record({
      action: AuditAction.POLICY_UPDATED,
      resource: AuditResource.POLICY,
      resourceId: policyId,
      actor: { userId: actorUserId },
      metadata: { addedConditionId: created.id },
    });
    return created;
  }

  async updateCondition(
    policyId: string,
    conditionId: string,
    dto: UpdatePolicyConditionDto,
    actorUserId: string,
  ) {
    const policy = await this.findById(policyId);
    const condition = await this.prisma.policyCondition.findFirst({
      where: { id: conditionId, policyId },
    });
    if (!condition) {
      throw new NotFoundAppException('Condition not found on policy');
    }
    const updated = await this.prisma.policyCondition.update({
      where: { id: conditionId },
      data: {
        attributeSource: dto.attributeSource ?? undefined,
        attributePath: dto.attributePath ?? undefined,
        operator: dto.operator ?? undefined,
        value: dto.value === undefined ? undefined : (dto.value as Prisma.InputJsonValue),
        valueType: dto.valueType ?? undefined,
      },
    });
    await this.invalidateAfterPolicyChange(policy.organizationId);
    await this.auditService.record({
      action: AuditAction.POLICY_UPDATED,
      resource: AuditResource.POLICY,
      resourceId: policyId,
      actor: { userId: actorUserId },
      metadata: { conditionId },
    });
    return updated;
  }

  async removeCondition(policyId: string, conditionId: string, actorUserId: string): Promise<void> {
    const policy = await this.findById(policyId);
    const result = await this.prisma.policyCondition.deleteMany({
      where: { id: conditionId, policyId },
    });
    if (result.count === 0) {
      throw new NotFoundAppException('Condition not found on policy');
    }
    await this.invalidateAfterPolicyChange(policy.organizationId);
    await this.auditService.record({
      action: AuditAction.POLICY_UPDATED,
      resource: AuditResource.POLICY,
      resourceId: policyId,
      actor: { userId: actorUserId },
      metadata: { removedConditionId: conditionId },
    });
  }

  async assign(
    policyId: string,
    dto: CreatePolicyAssignmentDto,
    actorUserId: string,
  ): Promise<PolicyAssignment> {
    const policy = await this.findById(policyId);
    if (!dto.roleId && !dto.userId && !dto.organizationId) {
      throw new AppException({
        code: AUTHZ_ERROR_CODES.POLICY_VALIDATION_FAILED,
        message: 'Policy assignment must target a role, user, or organization',
        status: 400,
      });
    }
    const assignment = await this.prisma.policyAssignment.create({
      data: {
        policyId,
        roleId: dto.roleId ?? null,
        userId: dto.userId ?? null,
        organizationId: dto.organizationId ?? null,
      },
    });
    await this.invalidateAfterPolicyChange(policy.organizationId);
    await this.auditService.record({
      action: AuditAction.POLICY_ASSIGNED,
      resource: AuditResource.POLICY,
      resourceId: policyId,
      actor: { userId: actorUserId },
      metadata: { assignmentId: assignment.id, target: dto },
    });
    return assignment;
  }

  async unassign(policyId: string, assignmentId: string, actorUserId: string): Promise<void> {
    const policy = await this.findById(policyId);
    const result = await this.prisma.policyAssignment.deleteMany({
      where: { id: assignmentId, policyId },
    });
    if (result.count === 0) {
      throw new NotFoundAppException('Policy assignment not found');
    }
    await this.invalidateAfterPolicyChange(policy.organizationId);
    await this.auditService.record({
      action: AuditAction.POLICY_UNASSIGNED,
      resource: AuditResource.POLICY,
      resourceId: policyId,
      actor: { userId: actorUserId },
      metadata: { assignmentId },
    });
  }

  async resolveForMembership(
    userId: string,
    organizationId: string,
    membershipId: string,
  ): Promise<SerializedPolicy[]> {
    const policies = await this.prisma.policy.findMany({
      where: {
        deletedAt: null,
        isEnabled: true,
        OR: [
          { isSystem: true },
          { organizationId: null },
          { organizationId },
          {
            assignments: {
              some: {
                OR: [
                  { userId },
                  { organizationId },
                  { role: { userRoles: { some: { membershipId } } } },
                ],
              },
            },
          },
        ],
      },
      include: { conditions: true },
      orderBy: { priority: 'desc' },
    });

    return policies.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      effect: p.effect,
      resource: p.resource,
      action: p.action,
      priority: p.priority,
      isEnabled: p.isEnabled,
      isSystem: p.isSystem,
      conditions: p.conditions.map((c) => ({
        id: c.id,
        attributeSource: c.attributeSource,
        attributePath: c.attributePath,
        operator: c.operator,
        value: c.value,
        valueType: c.valueType,
      })),
    }));
  }

  private conditionData(
    policyId: string,
    dto: CreatePolicyConditionDto,
  ): Prisma.PolicyConditionCreateManyInput {
    return {
      policyId,
      attributeSource: dto.attributeSource,
      attributePath: dto.attributePath,
      operator: dto.operator,
      value: dto.value as Prisma.InputJsonValue,
      valueType: dto.valueType ?? 'STRING',
    };
  }

  private async invalidateAfterPolicyChange(organizationId: string | null): Promise<void> {
    if (organizationId === null) {
      // System / global policy — bump all memberships' attribute versions to force token refresh
      const orgs = await this.prisma.organization.findMany({
        where: { deletedAt: null },
        select: { id: true },
      });
      for (const org of orgs) {
        await this.membershipService.bumpAllVersionsForOrg(org.id);
        await this.permissionService.invalidateForOrganization(org.id);
      }
      return;
    }
    await this.membershipService.bumpAllVersionsForOrg(organizationId);
    await this.permissionService.invalidateForOrganization(organizationId);
  }
}
