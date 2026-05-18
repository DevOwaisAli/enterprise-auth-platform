import { type ExecutionContext, createParamDecorator } from '@nestjs/common';

import { type AuthenticatedUser } from './current-user.decorator';

export interface OrganizationContext {
  organizationId: string;
  membershipId: string;
}

export const ActiveOrganization = createParamDecorator(
  (_: undefined, ctx: ExecutionContext): OrganizationContext | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user?.organizationId || !user?.membershipId) {
      return undefined;
    }
    return { organizationId: user.organizationId, membershipId: user.membershipId };
  },
);
