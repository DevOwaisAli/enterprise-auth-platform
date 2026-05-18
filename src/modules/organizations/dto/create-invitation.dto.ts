import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ description: 'Role to assign on accept' })
  @IsOptional()
  @IsUUID()
  roleId?: string;

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

  @ApiPropertyOptional({ minimum: 0, maximum: 10, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  clearanceLevel?: number;
}

export class AcceptInvitationDto {
  @ApiProperty()
  @IsString()
  @Length(16)
  token!: string;
}
