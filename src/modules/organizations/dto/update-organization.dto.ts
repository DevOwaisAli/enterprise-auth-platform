import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationPlan, OrganizationStatus } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, Length } from 'class-validator';

export class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({ enum: OrganizationStatus })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

  @ApiPropertyOptional({ enum: OrganizationPlan })
  @IsOptional()
  @IsEnum(OrganizationPlan)
  plan?: OrganizationPlan;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
