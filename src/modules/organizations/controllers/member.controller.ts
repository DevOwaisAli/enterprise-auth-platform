import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { type AuthenticatedUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { ResponseMessage } from '@common/decorators/response-message.decorator';
import { JwtAuthGuard, TenantGuard } from '@common/guards';

import { UpdateMemberDto } from '../dto';
import { MembershipService } from '../services/membership.service';

@ApiTags('Organization Members')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller({ path: 'organizations/:orgId/members' })
export class MemberController {
  constructor(private readonly membershipService: MembershipService) {}

  @Get()
  @ApiOperation({ summary: 'List all members of an organization' })
  async list(@Param('orgId') orgId: string) {
    return this.membershipService.list(orgId);
  }

  @Patch(':userId')
  @ResponseMessage('Member updated')
  @ApiOperation({
    summary: 'Update member ABAC attributes (department/region/jobTitle/clearance) or status',
  })
  async update(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.membershipService.updateAttributes(orgId, userId, dto, actor.id);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the organization (cannot remove last admin)' })
  async remove(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.membershipService.remove(orgId, userId, actor.id);
  }
}
