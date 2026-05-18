import { ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  jobTitle?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  clearanceLevel?: number;
}
