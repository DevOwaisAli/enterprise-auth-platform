import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttributeSource, AttributeValueType, PolicyEffect, PolicyOperator } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePolicyConditionDto {
  @ApiProperty({ enum: AttributeSource })
  @IsEnum(AttributeSource)
  attributeSource!: AttributeSource;

  @ApiProperty({ example: 'department', description: 'Dot path within the attribute source' })
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-zA-Z_][a-zA-Z0-9_.]*$/, {
    message: 'attributePath must be a safe dot path (alphanumerics, _ and . only)',
  })
  attributePath!: string;

  @ApiProperty({ enum: PolicyOperator })
  @IsEnum(PolicyOperator)
  operator!: PolicyOperator;

  @ApiProperty({ description: 'Comparison value. Strings may reference USER.id / RESOURCE.field' })
  @IsDefined({ message: 'value is required' })
  @Allow()
  value!: unknown;

  @ApiPropertyOptional({ enum: AttributeValueType, default: AttributeValueType.STRING })
  @IsOptional()
  @IsEnum(AttributeValueType)
  valueType?: AttributeValueType;
}

export class CreatePolicyDto {
  @ApiProperty()
  @IsString()
  @Length(2, 120)
  name!: string;

  @ApiProperty()
  @IsString()
  @Length(2, 120)
  @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message: 'slug must be lowercase, alphanumeric and hyphens only',
  })
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 480)
  description?: string;

  @ApiProperty({ enum: PolicyEffect })
  @IsEnum(PolicyEffect)
  effect!: PolicyEffect;

  @ApiProperty({ example: 'users' })
  @IsString()
  @Matches(/^[a-z*][a-z0-9_-]*$/, { message: 'resource may be * or lowercase identifier' })
  resource!: string;

  @ApiProperty({ example: 'read' })
  @IsString()
  @Matches(/^[a-z*][a-z0-9_-]*$/, { message: 'action may be * or lowercase identifier' })
  action!: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ type: [CreatePolicyConditionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePolicyConditionDto)
  conditions?: CreatePolicyConditionDto[];

  @ApiPropertyOptional({
    description: 'Org id to scope policy to. Omit for global system-scoped policies (admin only).',
  })
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}

export class UpdatePolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 480)
  description?: string;

  @ApiPropertyOptional({ enum: PolicyEffect })
  @IsOptional()
  @IsEnum(PolicyEffect)
  effect?: PolicyEffect;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class UpdatePolicyConditionDto {
  @ApiPropertyOptional({ enum: AttributeSource })
  @IsOptional()
  @IsEnum(AttributeSource)
  attributeSource?: AttributeSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  @Matches(/^[a-zA-Z_][a-zA-Z0-9_.]*$/)
  attributePath?: string;

  @ApiPropertyOptional({ enum: PolicyOperator })
  @IsOptional()
  @IsEnum(PolicyOperator)
  operator?: PolicyOperator;

  @ApiPropertyOptional()
  @IsOptional()
  value?: unknown;

  @ApiPropertyOptional({ enum: AttributeValueType })
  @IsOptional()
  @IsEnum(AttributeValueType)
  valueType?: AttributeValueType;
}

export class CreatePolicyAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
