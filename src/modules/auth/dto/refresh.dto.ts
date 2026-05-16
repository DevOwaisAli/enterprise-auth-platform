import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token issued at login' })
  @IsString()
  @MaxLength(512)
  refreshToken!: string;
}
