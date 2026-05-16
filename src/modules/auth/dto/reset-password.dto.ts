import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Password reset token from the reset email' })
  @IsString()
  @MaxLength(256)
  token!: string;

  @ApiProperty({ example: 'BrandNew-Passw0rd!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
