import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'CorrectHorse-Battery-Staple-9!' })
  @IsString()
  @MaxLength(128)
  password!: string;

  @ApiProperty({ required: false, example: 'Jane MacBook' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;
}
