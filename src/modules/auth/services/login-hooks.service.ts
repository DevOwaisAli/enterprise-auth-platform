import { Injectable } from '@nestjs/common';
import { type User } from '@prisma/client';

import { type LoginMetadata } from '../interfaces';

export interface MfaChallengeRequired {
  mfaRequired: true;
  challengeToken: string;
  challengeExpiresAt: Date;
  allowedMethods: string[];
}

export type MfaPreLoginHook = (
  user: User,
  metadata: LoginMetadata,
) => Promise<MfaChallengeRequired | null>;

export type SsoEnforcementHook = (user: User) => Promise<{ blocked: boolean; reason?: string }>;

@Injectable()
export class LoginHooksService {
  private mfaHook: MfaPreLoginHook | null = null;
  private ssoEnforcement: SsoEnforcementHook | null = null;

  registerMfaHook(hook: MfaPreLoginHook): void {
    this.mfaHook = hook;
  }

  registerSsoEnforcement(hook: SsoEnforcementHook): void {
    this.ssoEnforcement = hook;
  }

  async checkSsoEnforcement(user: User): Promise<{ blocked: boolean; reason?: string }> {
    if (!this.ssoEnforcement) {
      return { blocked: false };
    }
    return this.ssoEnforcement(user);
  }

  async checkMfa(user: User, metadata: LoginMetadata): Promise<MfaChallengeRequired | null> {
    if (!this.mfaHook) {
      return null;
    }
    return this.mfaHook(user, metadata);
  }
}
