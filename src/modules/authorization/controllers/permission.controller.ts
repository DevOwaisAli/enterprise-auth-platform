import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Permission } from '@prisma/client';

import { ResponseMessage } from '@common/decorators/response-message.decorator';
import { JwtAuthGuard } from '@common/guards';

import { RequirePermission } from '../decorators';
import { CreatePermissionDto } from '../dto';
import { AuthorizationGuard } from '../guards/authorization.guard';
import { PermissionService } from '../services/permission.service';

@ApiTags('Permissions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, AuthorizationGuard)
@Controller({ path: 'permissions' })
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Permission created')
  @RequirePermission('permissions', 'manage')
  @ApiOperation({ summary: 'Define a new resource:action permission (global)' })
  async create(@Body() dto: CreatePermissionDto): Promise<Permission> {
    return this.permissionService.create(dto);
  }

  @Get()
  @RequirePermission('permissions', 'manage')
  @ApiOperation({ summary: 'List every permission registered in the system' })
  async list(): Promise<Permission[]> {
    return this.permissionService.list();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('permissions', 'manage')
  @ApiOperation({ summary: 'Delete a permission (fails if any role references it)' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.permissionService.remove(id);
  }
}
