import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Request } from 'express';

import { type AuthenticatedUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ResponseMessage } from '@common/decorators/response-message.decorator';
import { JwtAuthGuard } from '@common/guards';
import { extractClientIp, extractUserAgent } from '@common/utils/request-context';

import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LoginResponseDto,
  RefreshDto,
  RegisterDto,
  RegisterResponseDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from '../dto';
import { type LoginMetadata } from '../interfaces';
import { AuthService } from '../services';

@ApiTags('Auth')
@Controller({ path: 'auth' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ResponseMessage('User registered. Verification email pending.')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, type: RegisterResponseDto })
  async register(@Body() dto: RegisterDto): Promise<{
    user: RegisterResponseDto['user'];
    emailVerificationExpiresAt: Date;
  }> {
    const result = await this.authService.register(dto);
    return {
      user: result.user as RegisterResponseDto['user'],
      emailVerificationExpiresAt: result.emailVerificationExpiresAt,
    };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Email verified')
  @ApiOperation({ summary: 'Verify a user email with a token' })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ userId: string }> {
    return this.authService.verifyEmail(dto.token);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Login successful')
  @ApiOperation({ summary: 'Authenticate with email + password' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponseDto> {
    const metadata = this.buildMetadata(req, dto.deviceName);
    const result = await this.authService.login(
      { email: dto.email, password: dto.password },
      metadata,
    );
    return {
      user: result.user as LoginResponseDto['user'],
      tokens: result.tokens,
      sessionId: result.sessionId,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Token refreshed')
  @ApiOperation({ summary: 'Rotate refresh token for a new access/refresh token pair' })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request): Promise<LoginResponseDto['tokens']> {
    const metadata = this.buildMetadata(req);
    return this.authService.refresh(dto.refreshToken, metadata);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logout(user.id, user.sessionId);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke every session for the current user' })
  async logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logoutAll(user.id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change password for the authenticated user' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword({
      userId: user.id,
      currentPassword: dto.currentPassword,
      newPassword: dto.newPassword,
      revokeOtherSessions: dto.revokeOtherSessions ?? true,
      currentSessionId: user.sessionId,
    });
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ResponseMessage('If the email exists, a reset link has been sent')
  @ApiOperation({ summary: 'Request a password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ accepted: true }> {
    await this.authService.requestPasswordReset(dto.email);
    return { accepted: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Password reset successful')
  @ApiOperation({ summary: 'Reset password using a token from email' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ success: true }> {
    await this.authService.resetPassword({ token: dto.token, newPassword: dto.newPassword });
    return { success: true };
  }

  private buildMetadata(req: Request, deviceName?: string): LoginMetadata {
    return {
      ipAddress: extractClientIp(req),
      userAgent: extractUserAgent(req),
      deviceName,
    };
  }
}
