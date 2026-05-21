import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ResponseMessage } from '@common/decorators/response-message.decorator';
import { JwtAuthGuard } from '@common/guards';
import { RequirePermission } from '@modules/authorization/decorators';
import { AuthorizationGuard } from '@modules/authorization/guards';

import { UpdateOrgMfaPolicyDto } from '../dto';
import { type OrganizationMfaSettings, MfaPolicyService } from '../services';

@ApiTags('MFA')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, AuthorizationGuard)
@Controller({ path: 'organizations/:orgId/mfa-policy' })
export class OrgMfaPolicyController {
  constructor(private readonly mfaPolicyService: MfaPolicyService) {}

  @Get()
  @RequirePermission('organization', 'read')
  @ApiOperation({ summary: 'Get the organization MFA policy' })
  async get(@Param('orgId') orgId: string): Promise<OrganizationMfaSettings> {
    return this.mfaPolicyService.getPolicyForOrganization(orgId);
  }

  @Put()
  @RequirePermission('organization', 'manage')
  @ResponseMessage('MFA policy updated')
  @ApiOperation({ summary: 'Update the organization MFA policy (enforce MFA, allowed methods)' })
  async update(
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrgMfaPolicyDto,
  ): Promise<OrganizationMfaSettings> {
    return this.mfaPolicyService.updateOrganizationPolicy(orgId, dto);
  }
}
