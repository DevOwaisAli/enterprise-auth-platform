import { Module } from '@nestjs/common';

import { InvitationController } from './controllers/invitation.controller';
import { MemberController } from './controllers/member.controller';
import { OrganizationController } from './controllers/organization.controller';
import { InvitationService } from './services/invitation.service';
import { MembershipService } from './services/membership.service';
import { OrganizationService } from './services/organization.service';

@Module({
  controllers: [OrganizationController, MemberController, InvitationController],
  providers: [OrganizationService, MembershipService, InvitationService],
  exports: [OrganizationService, MembershipService, InvitationService],
})
export class OrganizationsModule {}
