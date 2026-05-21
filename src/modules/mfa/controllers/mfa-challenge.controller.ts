import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { type Request } from 'express';

import { Public } from '@common/decorators/public.decorator';
import { ResponseMessage } from '@common/decorators/response-message.decorator';
import { extractClientIp, extractUserAgent } from '@common/utils/request-context';
import { type LoginResponseDto } from '@modules/auth/dto';
import { type LoginMetadata } from '@modules/auth/interfaces';

import { type MfaChallengeResponseDto, VerifyMfaChallengeDto } from '../dto';
import { MfaLoginService } from '../services/mfa-login.service';

class IssueChallengeDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Password to authenticate before issuing a fresh challenge' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}

@ApiTags('Auth')
@Controller({ path: 'auth/mfa' })
export class MfaChallengeController {
  constructor(private readonly mfaLoginService: MfaLoginService) {}

  @Public()
  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-issue an MFA challenge after a fresh password validation',
    description:
      'Use this when the previously issued challenge token expired or was abandoned. The user must re-supply email/password.',
  })
  async challenge(
    @Body() dto: IssueChallengeDto,
    @Req() req: Request,
  ): Promise<MfaChallengeResponseDto> {
    const metadata: LoginMetadata = {
      ipAddress: extractClientIp(req),
      userAgent: extractUserAgent(req),
    };
    return this.mfaLoginService.reissueChallenge(dto.email, dto.password, metadata);
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('MFA verified, login complete')
  @ApiOperation({ summary: 'Verify MFA challenge with TOTP or backup code' })
  @ApiResponse({ status: 200 })
  async verify(@Body() dto: VerifyMfaChallengeDto, @Req() req: Request): Promise<LoginResponseDto> {
    const metadata: LoginMetadata = {
      ipAddress: extractClientIp(req),
      userAgent: extractUserAgent(req),
      deviceName: dto.deviceName,
    };
    const result = await this.mfaLoginService.verifyAndCompleteLogin(dto, metadata);
    return {
      user: result.user as LoginResponseDto['user'],
      tokens: result.tokens,
      sessionId: result.sessionId,
    };
  }
}
