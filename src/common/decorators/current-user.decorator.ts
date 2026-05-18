import { type ExecutionContext, createParamDecorator } from '@nestjs/common';

export interface AuthenticatedUser {
  id: string;
  email: string;
  sessionId: string;
  tokenVersion: number;
  organizationId: string | null;
  membershipId: string | null;
  roles: string[];
  permissionsVersion: number;
  attributesVersion: number;
}

export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthenticatedUser | undefined,
    ctx: ExecutionContext,
  ): AuthenticatedUser | AuthenticatedUser[keyof AuthenticatedUser] | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      return undefined;
    }
    return data ? user[data] : user;
  },
);
