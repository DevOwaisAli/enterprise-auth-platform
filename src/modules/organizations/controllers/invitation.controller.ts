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
import { type OrganizationInvitation } from '@prisma/client';

import { type AuthenticatedUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { ResponseMessage } from '@common/decorators/response-message.decorator';
import { JwtAuthGuard, TenantGuard } from '@common/guards';

import { AcceptInvitationDto, CreateInvitationDto } from '../dto/create-invitation.dto';
import { InvitationService } from '../services/invitation.service';

@ApiTags('Organization Invitations')
@Controller()
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @Post('organizations/:orgId/invitations')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('Invitation created')
  @ApiOperation({ summary: 'Create an invitation to join an organization' })
  async create(
    @Param('orgId') orgId: string,
    @Body() dto: CreateInvitationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OrganizationInvitation> {
    const { invitation } = await this.invitationService.create(orgId, dto, actor.id);
    return invitation;
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @Get('organizations/:orgId/invitations')
  @ApiOperation({ summary: 'List invitations for an organization' })
  async list(@Param('orgId') orgId: string): Promise<OrganizationInvitation[]> {
    return this.invitationService.list(orgId);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @Delete('organizations/:orgId/invitations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an invitation' })
  async revoke(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.invitationService.revoke(id, orgId, actor.id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post('organizations/invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Invitation accepted')
  @ApiOperation({ summary: 'Accept an invitation as the authenticated user' })
  async accept(
    @Body() dto: AcceptInvitationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ organizationId: string; membershipId: string }> {
    return this.invitationService.accept(dto.token, actor.id, actor.email);
  }
}
