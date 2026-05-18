import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { MembershipStatus, OrganizationStatus, UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { type AuthenticatedUser } from '@common/decorators/current-user.decorator';
import { type JwtConfig, JWT_CONFIG_KEY } from '@config/jwt.config';
import { PrismaService } from '@infrastructure/database';

import { AUTH_ERROR_CODES, AUTH_STRATEGIES } from '../constants';
import { type JwtAccessPayload } from '../interfaces';
import { SessionService } from '../services/session.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, AUTH_STRATEGIES.JWT) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly sessionService: SessionService,
  ) {
    const jwtConfig = configService.getOrThrow<JwtConfig>(JWT_CONFIG_KEY);
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtConfig.accessSecret,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
    });
  }

  async validate(payload: JwtAccessPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null, status: UserStatus.ACTIVE },
    });
    if (!user) {
      throw new UnauthorizedException(AUTH_ERROR_CODES.ACCOUNT_INACTIVE);
    }
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException(AUTH_ERROR_CODES.TOKEN_VERSION_MISMATCH);
    }

    const session = await this.sessionService.findSessionById(payload.sessionId);
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException(AUTH_ERROR_CODES.SESSION_REVOKED);
    }

    if (payload.membershipId && payload.organizationId) {
      const membership = await this.prisma.membership.findFirst({
        where: {
          id: payload.membershipId,
          userId: user.id,
          organizationId: payload.organizationId,
          deletedAt: null,
        },
        include: { organization: true },
      });
      if (!membership || membership.status !== MembershipStatus.ACTIVE) {
        throw new UnauthorizedException(AUTH_ERROR_CODES.MEMBERSHIP_INVALID);
      }
      if (membership.organization.status !== OrganizationStatus.ACTIVE) {
        throw new UnauthorizedException(AUTH_ERROR_CODES.ORG_INACTIVE);
      }
      if (membership.permissionsVersion !== payload.permissionsVersion) {
        throw new UnauthorizedException(AUTH_ERROR_CODES.PERMISSIONS_VERSION_MISMATCH);
      }
      if (membership.attributesVersion !== payload.attributesVersion) {
        throw new UnauthorizedException(AUTH_ERROR_CODES.ATTRIBUTES_VERSION_MISMATCH);
      }
    }

    return {
      id: user.id,
      email: user.email,
      sessionId: session.id,
      tokenVersion: user.tokenVersion,
      organizationId: payload.organizationId,
      membershipId: payload.membershipId,
      roles: payload.roles ?? [],
      permissionsVersion: payload.permissionsVersion,
      attributesVersion: payload.attributesVersion,
    };
  }
}
