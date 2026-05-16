import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ required: false, nullable: true }) firstName!: string | null;
  @ApiProperty({ required: false, nullable: true }) lastName!: string | null;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty() isEmailVerified!: boolean;
  @ApiProperty({ required: false, nullable: true }) lastLoginAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class AuthTokensDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty() accessTokenExpiresAt!: Date;
  @ApiProperty() refreshTokenExpiresAt!: Date;
}

export class LoginResponseDto {
  @ApiProperty({ type: UserResponseDto }) user!: UserResponseDto;
  @ApiProperty({ type: AuthTokensDto }) tokens!: AuthTokensDto;
  @ApiProperty() sessionId!: string;
}

export class RegisterResponseDto {
  @ApiProperty({ type: UserResponseDto }) user!: UserResponseDto;
  @ApiProperty({ description: 'Verification token expiry (the raw token is sent via email)' })
  emailVerificationExpiresAt!: Date;
}

export class SessionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ required: false, nullable: true }) ipAddress!: string | null;
  @ApiProperty({ required: false, nullable: true }) userAgent!: string | null;
  @ApiProperty({ required: false, nullable: true }) deviceName!: string | null;
  @ApiProperty() lastActivityAt!: Date;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ description: 'Whether this is the session of the requesting client' })
  isCurrent!: boolean;
}
