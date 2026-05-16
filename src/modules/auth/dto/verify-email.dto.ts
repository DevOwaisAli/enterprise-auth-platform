import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'Email verification token from the verification email' })
  @IsString()
  @MaxLength(256)
  token!: string;
}
