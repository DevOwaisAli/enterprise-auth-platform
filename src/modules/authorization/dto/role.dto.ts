import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ description: 'Role display name' })
  @IsString()
  @Length(2, 60)
  name!: string;

  @ApiProperty({ description: 'Role slug, kebab-case' })
  @IsString()
  @Length(2, 60)
  @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message: 'slug must be lowercase, alphanumeric and hyphens only',
  })
  slug!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 240)
  description?: string;

  @ApiPropertyOptional({ description: 'Permission ids to attach on create', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  permissionIds?: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 240)
  description?: string;
}

export class AssignRoleDto {
  @ApiProperty()
  @IsUUID()
  roleId!: string;
}

export class SetRolePermissionsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  permissionIds!: string[];
}
