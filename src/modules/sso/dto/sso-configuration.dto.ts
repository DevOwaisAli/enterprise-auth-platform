import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AttributeMappingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jobTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() groups?: string;
}

export class CreateSsoConfigurationDto {
  @ApiProperty()
  @IsUUID()
  organizationId!: string;

  @ApiProperty({ example: 'Okta' })
  @IsString()
  @MaxLength(120)
  providerName!: string;

  @ApiProperty({ description: 'IdP SSO entry point URL' })
  @IsUrl({ require_tld: false })
  entryPoint!: string;

  @ApiProperty({ description: 'IdP issuer / entity ID' })
  @IsString()
  issuer!: string;

  @ApiProperty({ description: 'IdP X.509 signing certificate (PEM, base64 body)' })
  @IsString()
  certificate!: string;

  @ApiPropertyOptional({ description: 'IdP metadata URL' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  metadataUrl?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowIdpInitiated?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Disable password login for this org' })
  @IsOptional()
  @IsBoolean()
  ssoOnlyMode?: boolean;

  @ApiPropertyOptional({ type: AttributeMappingDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AttributeMappingDto)
  attributeMapping?: AttributeMappingDto;

  @ApiPropertyOptional({ description: 'Default role slug to assign on JIT provisioning' })
  @IsOptional()
  @IsString()
  defaultRoleSlug?: string;
}

export class UpdateSsoConfigurationDto extends PartialType(CreateSsoConfigurationDto) {}

export class SsoConfigurationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() providerName!: string;
  @ApiProperty() entryPoint!: string;
  @ApiProperty() issuer!: string;
  @ApiPropertyOptional({ nullable: true }) metadataUrl!: string | null;
  @ApiProperty() isEnabled!: boolean;
  @ApiProperty() allowIdpInitiated!: boolean;
  @ApiProperty() ssoOnlyMode!: boolean;
  @ApiProperty({ type: Object }) attributeMapping!: Record<string, string>;
  @ApiPropertyOptional({ nullable: true }) defaultRoleSlug!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
