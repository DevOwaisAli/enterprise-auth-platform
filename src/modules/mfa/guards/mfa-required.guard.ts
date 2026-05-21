import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

import { type AuthenticatedUser } from '@common/decorators/current-user.decorator';

import { MFA_ERROR_CODES } from '../constants';
import { MfaPolicyService } from '../services/mfa-policy.service';
import { MfaService } from '../services/mfa.service';

@Injectable()
export class MfaRequiredGuard implements CanActivate {
  constructor(
    private readonly mfaService: MfaService,
    private readonly mfaPolicyService: MfaPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authenticated user required');
    }

    const policy = await this.mfaPolicyService.getEffectivePolicyForUser(user.id);
    if (!policy.requireMfa) {
      return true;
    }
    const enabled = await this.mfaService.isMfaEnabled(user.id);
    if (!enabled) {
      throw new ForbiddenException({
        code: MFA_ERROR_CODES.MFA_REQUIRED_BY_ORG,
        message: 'MFA is required by your organization. Enroll in MFA to continue.',
      });
    }
    return true;
  }
}
