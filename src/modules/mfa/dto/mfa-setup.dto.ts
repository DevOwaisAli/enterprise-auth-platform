import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class VerifyMfaSetupDto {
  @ApiProperty({ description: '6-digit TOTP code from authenticator app' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class DisableMfaDto {
  @ApiProperty({ description: 'Current password for re-authentication' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiProperty({ description: 'Current TOTP code to confirm ownership' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class MfaSetupResponseDto {
  @ApiProperty({ description: 'Base32-encoded TOTP secret' })
  secret!: string;

  @ApiProperty({ description: 'otpauth:// URI for QR generation' })
  otpauthUrl!: string;

  @ApiProperty({ description: 'Data URL of QR code image' })
  qrCodeDataUrl!: string;
}

export class BackupCodesResponseDto {
  @ApiProperty({ description: 'Plaintext backup codes (shown once)', type: [String] })
  codes!: string[];

  @ApiProperty({ description: 'When these codes were generated' })
  generatedAt!: Date;
}
