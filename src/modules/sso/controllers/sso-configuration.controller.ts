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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { type AuthenticatedUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { ResponseMessage } from '@common/decorators/response-message.decorator';
import { JwtAuthGuard } from '@common/guards';
import { RequirePermission } from '@modules/authorization/decorators';
import { AuthorizationGuard } from '@modules/authorization/guards';

import {
  CreateSsoConfigurationDto,
  SsoConfigurationResponseDto,
  UpdateSsoConfigurationDto,
} from '../dto';
import { SsoConfigurationService } from '../services';

@ApiTags('SSO')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, AuthorizationGuard)
@Controller({ path: 'sso/configurations' })
export class SsoConfigurationController {
  constructor(private readonly configService: SsoConfigurationService) {}

  @Post()
  @RequirePermission('organization', 'manage')
  @ResponseMessage('SSO configuration created')
  @ApiOperation({ summary: 'Create a SAML SSO configuration for an organization' })
  @ApiResponse({ status: 201, type: SsoConfigurationResponseDto })
  async create(
    @Body() dto: CreateSsoConfigurationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SsoConfigurationResponseDto> {
    return this.configService.create(dto, user.id);
  }

  @Get()
  @RequirePermission('organization', 'read')
  @ApiOperation({ summary: 'List SSO configurations for an organization' })
  @ApiResponse({ status: 200, type: [SsoConfigurationResponseDto] })
  async list(
    @Query('organizationId') organizationId: string,
  ): Promise<SsoConfigurationResponseDto[]> {
    return this.configService.findAllForOrganization(organizationId);
  }

  @Patch(':id')
  @RequirePermission('organization', 'manage')
  @ResponseMessage('SSO configuration updated')
  @ApiOperation({ summary: 'Update a SAML SSO configuration' })
  @ApiResponse({ status: 200, type: SsoConfigurationResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSsoConfigurationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SsoConfigurationResponseDto> {
    return this.configService.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermission('organization', 'manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a SAML SSO configuration' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.configService.remove(id, user.id);
  }
}
