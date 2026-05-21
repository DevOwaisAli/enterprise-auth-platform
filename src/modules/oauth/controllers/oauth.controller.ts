import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OAuthProvider } from '@prisma/client';
import { type Request, type Response } from 'express';

import { type AuthenticatedUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { ResponseMessage } from '@common/decorators/response-message.decorator';
import { AppException } from '@common/exceptions';
import { JwtAuthGuard } from '@common/guards';
import { extractClientIp, extractUserAgent } from '@common/utils/request-context';
import { FEDERATION_CONFIG_KEY, type FederationConfig } from '@config/federation.config';
import { type LoginMetadata } from '@modules/auth/interfaces';

import { OAUTH_ERROR_CODES } from '../constants';
import { OAuthAccountDto, OAuthLoginResultDto } from '../dto';
import { OAuthFlowService, OAuthService } from '../services';
import { sanitizeRedirect } from '../utils';

const PROVIDER_SLUGS: Record<string, OAuthProvider> = {
  google: OAuthProvider.GOOGLE,
  github: OAuthProvider.GITHUB,
  microsoft: OAuthProvider.MICROSOFT,
};

@ApiTags('OAuth')
@Controller({ path: 'oauth' })
export class OAuthController {
  private readonly federationConfig: FederationConfig;

  constructor(
    private readonly flowService: OAuthFlowService,
    private readonly oauthService: OAuthService,
    configService: ConfigService,
  ) {
    this.federationConfig = configService.getOrThrow<FederationConfig>(FEDERATION_CONFIG_KEY);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Get('accounts')
  @ResponseMessage('Linked accounts')
  @ApiOperation({ summary: 'List linked OAuth accounts for the authenticated user' })
  @ApiResponse({ status: 200, type: [OAuthAccountDto] })
  async accounts(@CurrentUser() user: AuthenticatedUser): Promise<OAuthAccountDto[]> {
    return this.oauthService.listAccounts(user.id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Post('link/:provider')
  @ApiOperation({ summary: 'Begin linking a provider to the authenticated account' })
  async link(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') providerSlug: string,
    @Query('redirectTo') redirectTo?: string,
  ): Promise<{ authorizationUrl: string }> {
    const provider = this.resolveProvider(providerSlug);
    const authorizationUrl = await this.flowService.beginLink(provider, user.id, redirectTo);
    return { authorizationUrl };
  }

  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Delete('unlink/:provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unlink a provider (blocked if it is the last auth method)' })
  async unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') providerSlug: string,
  ): Promise<void> {
    const provider = this.resolveProvider(providerSlug);
    await this.oauthService.unlinkAccount(user.id, provider);
  }

  @Public()
  @Get(':provider')
  @ApiOperation({ summary: 'Start OAuth login/signup flow (redirects to provider)' })
  @ApiQuery({ name: 'redirectTo', required: false })
  async startLogin(
    @Param('provider') providerSlug: string,
    @Res() res: Response,
    @Query('redirectTo') redirectTo?: string,
  ): Promise<void> {
    const provider = this.resolveProvider(providerSlug);
    const url = await this.flowService.beginLogin(provider, redirectTo);
    res.redirect(url);
  }

  @Public()
  @Get(':provider/callback')
  @ApiOperation({ summary: 'OAuth provider callback; issues JWT/session or redirects' })
  async callback(
    @Param('provider') providerSlug: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    const provider = this.resolveProvider(providerSlug);
    if (error || !code || !state) {
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_STATE_INVALID,
        message: error ? `OAuth provider error: ${error}` : 'Missing code or state',
        status: 400,
      });
    }
    const metadata: LoginMetadata = {
      ipAddress: extractClientIp(req),
      userAgent: extractUserAgent(req),
    };
    const outcome = await this.flowService.handleCallback(provider, code, state, metadata);

    const fallback = `${this.federationConfig.baseUrl}/auth/oauth/complete`;
    const target = sanitizeRedirect(outcome.redirectTo, this.federationConfig.baseUrl, fallback);

    if (outcome.mode === 'link') {
      res.redirect(`${target}?linked=${provider.toLowerCase()}`);
      return;
    }

    const result = outcome.result;
    if (!result) {
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_STATE_INVALID,
        message: 'OAuth login failed',
        status: 401,
      });
    }

    if (outcome.redirectTo) {
      const url = new URL(target);
      url.searchParams.set('accessToken', result.tokens.accessToken);
      url.searchParams.set('refreshToken', result.tokens.refreshToken);
      res.redirect(url.toString());
      return;
    }

    const payload: OAuthLoginResultDto = {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      sessionId: result.sessionId,
      isNewUser: result.isNewUser,
    };
    res.status(HttpStatus.OK).json({ success: true, data: payload });
  }

  private resolveProvider(slug: string): OAuthProvider {
    const provider = PROVIDER_SLUGS[slug?.toLowerCase()];
    if (!provider) {
      throw new AppException({
        code: OAUTH_ERROR_CODES.OAUTH_PROVIDER_NOT_CONFIGURED,
        message: `Unsupported OAuth provider: ${slug}`,
        status: 404,
      });
    }
    return provider;
  }
}
