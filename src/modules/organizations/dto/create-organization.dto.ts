import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrganizationPlan, OrganizationStatus } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Inc.' })
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiProperty({ example: 'acme', description: 'URL-safe slug, lowercase, hyphens only' })
  @IsString()
  @Length(2, 60)
  @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message: 'slug must be lowercase, alphanumeric and hyphens only',
  })
  slug!: string;

  @ApiPropertyOptional({ enum: OrganizationStatus, default: OrganizationStatus.ACTIVE })
  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

  @ApiPropertyOptional({ enum: OrganizationPlan, default: OrganizationPlan.FREE })
  @IsOptional()
  @IsEnum(OrganizationPlan)
  plan?: OrganizationPlan;

  @ApiPropertyOptional({ description: 'Free-form settings JSON' })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
