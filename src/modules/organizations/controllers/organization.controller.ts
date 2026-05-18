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
import { type Organization } from '@prisma/client';

import { type AuthenticatedUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { ResponseMessage } from '@common/decorators/response-message.decorator';
import { JwtAuthGuard } from '@common/guards';

import { CreateOrganizationDto, UpdateOrganizationDto } from '../dto';
import { OrganizationService } from '../services/organization.service';

@ApiTags('Organizations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'organizations' })
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Organization created')
  @ApiOperation({ summary: 'Create a new organization. The creator becomes the first admin.' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrganizationDto,
  ): Promise<Organization> {
    return this.organizationService.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List organizations the current user belongs to' })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<Organization[]> {
    return this.organizationService.findAllForUser(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single organization by id' })
  async findOne(@Param('id') id: string): Promise<Organization> {
    return this.organizationService.findById(id);
  }

  @Patch(':id')
  @ResponseMessage('Organization updated')
  @ApiOperation({ summary: 'Update organization fields' })
  async update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto): Promise<Organization> {
    return this.organizationService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an organization' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.organizationService.softDelete(id, user.id);
  }
}
