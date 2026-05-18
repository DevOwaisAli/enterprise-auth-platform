import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Policy, type PolicyAssignment, type PolicyCondition } from '@prisma/client';

import { type AuthenticatedUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { ResponseMessage } from '@common/decorators/response-message.decorator';
import { JwtAuthGuard } from '@common/guards';

import { RequirePermission } from '../decorators';
import {
  CreatePolicyAssignmentDto,
  CreatePolicyConditionDto,
  CreatePolicyDto,
  UpdatePolicyConditionDto,
  UpdatePolicyDto,
} from '../dto';
import { AuthorizationGuard } from '../guards/authorization.guard';
import { PolicyService } from '../services/policy.service';

@ApiTags('Policies')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, AuthorizationGuard)
@Controller({ path: 'policies' })
export class PolicyController {
  constructor(private readonly policyService: PolicyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Policy created')
  @RequirePermission('policies', 'manage')
  @ApiOperation({ summary: 'Create a new ABAC policy (org-scoped or global)' })
  async create(
    @Body() dto: CreatePolicyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Policy> {
    return this.policyService.create(dto, user.id);
  }

  @Get()
  @RequirePermission('policies', 'manage')
  @ApiOperation({ summary: 'List policies visible to the active organization' })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<Policy[]> {
    return this.policyService.list(user.organizationId);
  }

  @Get(':id')
  @RequirePermission('policies', 'manage')
  @ApiOperation({ summary: 'Fetch a policy by id (with conditions)' })
  async findOne(@Param('id') id: string) {
    return this.policyService.findById(id);
  }

  @Patch(':id')
  @ResponseMessage('Policy updated')
  @RequirePermission('policies', 'manage')
  @ApiOperation({ summary: 'Update a policy (system policies are read-only)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePolicyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Policy> {
    return this.policyService.update(id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('policies', 'manage')
  @ApiOperation({ summary: 'Soft-delete a policy' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.policyService.remove(id, user.id);
  }

  @Post(':id/conditions')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Condition added')
  @RequirePermission('policies', 'manage')
  @ApiOperation({ summary: 'Add a condition to a policy' })
  async addCondition(
    @Param('id') id: string,
    @Body() dto: CreatePolicyConditionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PolicyCondition> {
    return this.policyService.addCondition(id, dto, user.id);
  }

  @Patch(':id/conditions/:conditionId')
  @ResponseMessage('Condition updated')
  @RequirePermission('policies', 'manage')
  @ApiOperation({ summary: 'Update a condition on a policy' })
  async updateCondition(
    @Param('id') id: string,
    @Param('conditionId') conditionId: string,
    @Body() dto: UpdatePolicyConditionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PolicyCondition> {
    return this.policyService.updateCondition(id, conditionId, dto, user.id);
  }

  @Delete(':id/conditions/:conditionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('policies', 'manage')
  @ApiOperation({ summary: 'Remove a condition from a policy' })
  async removeCondition(
    @Param('id') id: string,
    @Param('conditionId') conditionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.policyService.removeCondition(id, conditionId, user.id);
  }

  @Post(':id/assignments')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Policy assigned')
  @RequirePermission('policies', 'manage')
  @ApiOperation({ summary: 'Assign a policy to a role, user, or organization' })
  async assign(
    @Param('id') id: string,
    @Body() dto: CreatePolicyAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PolicyAssignment> {
    return this.policyService.assign(id, dto, user.id);
  }

  @Delete(':id/assignments/:assignmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('policies', 'manage')
  @ApiOperation({ summary: 'Unassign a policy assignment' })
  async unassign(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.policyService.unassign(id, assignmentId, user.id);
  }
}
