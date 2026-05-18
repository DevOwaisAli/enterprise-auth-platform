import { type ExecutionContext } from '@nestjs/common';

import { ForbiddenAppException } from '@common/exceptions';

import { TenantGuard } from './tenant.guard';

function buildContext(orgIdParam: string | undefined, userOrgId: string | null): ExecutionContext {
  const request = {
    params: orgIdParam ? { orgId: orgIdParam } : {},
    user:
      userOrgId === null
        ? undefined
        : {
            id: 'u',
            email: 'u@u.com',
            sessionId: 's',
            tokenVersion: 0,
            organizationId: userOrgId,
            membershipId: 'm',
            roles: [],
            permissionsVersion: 1,
            attributesVersion: 1,
          },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
  const guard = new TenantGuard();

  it('blocks cross-tenant path access', () => {
    expect(() => guard.canActivate(buildContext('org-A', 'org-B'))).toThrow(ForbiddenAppException);
  });

  it('allows matching tenant', () => {
    expect(guard.canActivate(buildContext('org-A', 'org-A'))).toBe(true);
  });

  it('allows request without orgId param', () => {
    expect(guard.canActivate(buildContext(undefined, 'org-A'))).toBe(true);
  });

  it('rejects unauthenticated request', () => {
    expect(() => guard.canActivate(buildContext('org-A', null))).toThrow(ForbiddenAppException);
  });
});
