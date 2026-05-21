import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export enum MfaChallengeMethod {
  TOTP = 'totp',
  BACKUP_CODE = 'backup_code',
}

export class VerifyMfaChallengeDto {
  @ApiProperty({ description: 'Pre-auth challenge token issued during login' })
  @IsString()
  @IsNotEmpty()
  challengeToken!: string;

  @ApiProperty({ enum: MfaChallengeMethod, description: 'TOTP or backup code' })
  @IsEnum(MfaChallengeMethod)
  method!: MfaChallengeMethod;

  @ApiProperty({ description: 'TOTP code or backup code value' })
  @IsString()
  @MinLength(6)
  code!: string;

  @ApiProperty({ required: false, description: 'Optional device name to record' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class MfaChallengeResponseDto {
  @ApiProperty()
  challengeToken!: string;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty({ enum: MfaChallengeMethod, isArray: true })
  allowedMethods!: MfaChallengeMethod[];
}
