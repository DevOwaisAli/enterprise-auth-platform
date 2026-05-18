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
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Role } from '@prisma/client';

import { type AuthenticatedUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { ResponseMessage } from '@common/decorators/response-message.decorator';
import { JwtAuthGuard, TenantGuard } from '@common/guards';

import { RequirePermission } from '../decorators';
import { CreateRoleDto, SetRolePermissionsDto, UpdateRoleDto } from '../dto';
import { AuthorizationGuard } from '../guards/authorization.guard';
import { RoleService } from '../services/role.service';

@ApiTags('Roles')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard, AuthorizationGuard)
@Controller({ path: 'organizations/:orgId/roles' })
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Role created')
  @RequirePermission('roles', 'manage')
  @ApiOperation({ summary: 'Create a custom role inside an organization' })
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Role> {
    return this.roleService.create(orgId, dto, user.id);
  }

  @Get()
  @RequirePermission('roles', 'manage')
  @ApiOperation({ summary: 'List roles visible to the organization (org-scoped + global system)' })
  async list(@Param('orgId') orgId: string): Promise<Role[]> {
    return this.roleService.list(orgId);
  }

  @Get(':id')
  @RequirePermission('roles', 'manage')
  @ApiOperation({ summary: 'Fetch a role by id' })
  async findOne(@Param('id') id: string): Promise<Role> {
    return this.roleService.findById(id);
  }

  @Patch(':id')
  @ResponseMessage('Role updated')
  @RequirePermission('roles', 'manage')
  @ApiOperation({ summary: 'Update a custom role (system roles are read-only)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Role> {
    return this.roleService.update(id, dto, user.id);
  }

  @Put(':id/permissions')
  @ResponseMessage('Role permissions updated')
  @RequirePermission('roles', 'manage')
  @ApiOperation({ summary: 'Replace the permission set assigned to a role' })
  async setPermissions(
    @Param('id') id: string,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    await this.roleService.setPermissions(id, dto, user.id);
    return { success: true };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('roles', 'manage')
  @ApiOperation({ summary: 'Soft-delete a custom role' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.roleService.remove(id, user.id);
  }

  @Post(':id/members/:membershipId')
  @ResponseMessage('Role assigned to membership')
  @RequirePermission('roles', 'manage')
  @ApiOperation({ summary: 'Assign a role to an organization membership' })
  async assign(
    @Param('orgId') orgId: string,
    @Param('id') roleId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    await this.roleService.assignToMembership(orgId, membershipId, roleId, user.id);
    return { success: true };
  }

  @Delete(':id/members/:membershipId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('roles', 'manage')
  @ApiOperation({ summary: 'Revoke a role from an organization membership' })
  async revoke(
    @Param('orgId') orgId: string,
    @Param('id') roleId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.roleService.revokeFromMembership(orgId, membershipId, roleId, user.id);
  }
}
