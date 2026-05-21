import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

import { type AuthenticatedUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { ResponseMessage } from '@common/decorators/response-message.decorator';
import { JwtAuthGuard } from '@common/guards';

import {
  BackupCodesResponseDto,
  DisableMfaDto,
  MfaSetupResponseDto,
  VerifyMfaSetupDto,
} from '../dto';
import { MfaService } from '../services';

class RegenerateBackupCodesDto {
  @ApiProperty({ description: 'Account password for re-authentication' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

@ApiTags('MFA')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'mfa' })
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('MFA setup initiated')
  @ApiOperation({ summary: 'Initialize MFA enrollment (returns QR + secret)' })
  @ApiResponse({ status: 200, type: MfaSetupResponseDto })
  async setup(@CurrentUser() user: AuthenticatedUser): Promise<MfaSetupResponseDto> {
    return this.mfaService.setup(user.id);
  }

  @Post('verify-setup')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('MFA enabled')
  @ApiOperation({ summary: 'Verify the first TOTP code and enable MFA' })
  @ApiResponse({ status: 200, type: BackupCodesResponseDto })
  async verifySetup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyMfaSetupDto,
  ): Promise<BackupCodesResponseDto> {
    return this.mfaService.verifySetup(user.id, dto.code);
  }

  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disable MFA (requires password + TOTP code)' })
  async disable(@CurrentUser() user: AuthenticatedUser, @Body() dto: DisableMfaDto): Promise<void> {
    await this.mfaService.disable(user.id, dto.password, dto.code);
  }

  @Get('backup-codes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Return remaining backup code count (codes are shown only once on creation)',
  })
  async backupCodesStatus(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ total: number; remaining: number }> {
    return this.mfaService.listBackupCodeStatus(user.id);
  }

  @Post('regenerate-backup-codes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Regenerate a new set of backup codes (invalidates previous set)' })
  @ApiResponse({ status: 200, type: BackupCodesResponseDto })
  async regenerateBackupCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegenerateBackupCodesDto,
  ): Promise<BackupCodesResponseDto> {
    return this.mfaService.regenerateBackupCodes(user.id, dto.password);
  }
}
