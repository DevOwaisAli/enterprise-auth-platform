import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsOptional } from 'class-validator';

import { MfaChallengeMethod } from './mfa-challenge.dto';

export class UpdateOrgMfaPolicyDto {
  @ApiPropertyOptional({ description: 'Require all members to enroll in MFA' })
  @IsOptional()
  @IsBoolean()
  requireMfa?: boolean;

  @ApiPropertyOptional({ description: 'Allow backup codes as an MFA method' })
  @IsOptional()
  @IsBoolean()
  allowBackupCodes?: boolean;

  @ApiPropertyOptional({ enum: MfaChallengeMethod, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(MfaChallengeMethod, { each: true })
  allowedMfaMethods?: MfaChallengeMethod[];
}
