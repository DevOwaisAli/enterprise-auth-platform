import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { ValidationAppException } from '@common/exceptions';
import { type ApiErrorDetail } from '@common/types';
import { type AuthConfig, AUTH_CONFIG_KEY } from '@config/auth.config';

import { AUTH_ERROR_CODES } from '../constants';
import { evaluatePassword } from '../utils';

@Injectable()
export class PasswordService {
  private readonly config: AuthConfig;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<AuthConfig>(AUTH_CONFIG_KEY);
  }

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.config.bcryptSaltRounds);
  }

  compare(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }

  enforcePolicy(password: string): void {
    const result = evaluatePassword(password, this.config.passwordPolicy);
    if (!result.valid) {
      const errors: ApiErrorDetail[] = result.errors.map((message) => ({
        field: 'password',
        code: AUTH_ERROR_CODES.WEAK_PASSWORD,
        message,
      }));
      throw new ValidationAppException(errors, 'Password does not meet the security policy');
    }
  }
}
