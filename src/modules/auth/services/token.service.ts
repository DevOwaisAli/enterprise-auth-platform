import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';

import { type JwtConfig, JWT_CONFIG_KEY } from '@config/jwt.config';

import { type JwtAccessPayload } from '../interfaces';

type DurationString = `${number}${'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'y'}`;

@Injectable()
export class TokenService {
  private readonly jwtConfig: JwtConfig;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    this.jwtConfig = configService.getOrThrow<JwtConfig>(JWT_CONFIG_KEY);
  }

  async signAccessToken(payload: JwtAccessPayload): Promise<string> {
    const options: JwtSignOptions = {
      secret: this.jwtConfig.accessSecret,
      expiresIn: this.jwtConfig.accessExpiresIn as DurationString,
      issuer: this.jwtConfig.issuer,
      audience: this.jwtConfig.audience,
    };
    return this.jwtService.signAsync(payload, options);
  }

  async verifyAccessToken(token: string): Promise<JwtAccessPayload> {
    return this.jwtService.verifyAsync<JwtAccessPayload>(token, {
      secret: this.jwtConfig.accessSecret,
      issuer: this.jwtConfig.issuer,
      audience: this.jwtConfig.audience,
    });
  }
}
