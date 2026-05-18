import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({ example: 'users' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]*$/, {
    message: 'resource must be lowercase, starts with a letter, hyphens/underscores allowed',
  })
  @Length(2, 60)
  resource!: string;

  @ApiProperty({ example: 'read' })
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]*$/, {
    message: 'action must be lowercase, starts with a letter, hyphens/underscores allowed',
  })
  @Length(2, 60)
  action!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 240)
  description?: string;
}
