import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SwitchOrganizationDto {
  @ApiProperty({
    description: 'Target organization id',
    example: '0190a000-0000-7000-8000-000000000000',
  })
  @IsUUID()
  organizationId!: string;
}

export class SwitchOrganizationResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  organizationId!: string;
}
