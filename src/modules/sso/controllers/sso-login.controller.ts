import { Body, Controller, Get, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Request, type Response } from 'express';

import { Public } from '@common/decorators/public.decorator';
import { extractClientIp, extractUserAgent } from '@common/utils/request-context';
import { type LoginMetadata } from '@modules/auth/interfaces';

import { SsoLoginService } from '../services';

interface AcsBody {
  SAMLResponse?: string;
  RelayState?: string;
}

@ApiTags('SSO')
@Controller({ path: 'sso' })
export class SsoLoginController {
  constructor(private readonly ssoLoginService: SsoLoginService) {}

  @Public()
  @Get(':organizationSlug/login')
  @ApiOperation({ summary: 'SP-initiated SSO login (redirects to the IdP)' })
  async login(
    @Param('organizationSlug') organizationSlug: string,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.ssoLoginService.beginSpInitiatedLogin(organizationSlug);
    res.redirect(url);
  }

  @Public()
  @Post(':organizationSlug/acs')
  @ApiOperation({
    summary: 'Assertion Consumer Service (ACS) — receives and validates the SAML response',
  })
  async acs(
    @Param('organizationSlug') organizationSlug: string,
    @Body() body: AcsBody,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const metadata: LoginMetadata = {
      ipAddress: extractClientIp(req),
      userAgent: extractUserAgent(req),
    };
    const result = await this.ssoLoginService.handleAssertion(
      organizationSlug,
      body.SAMLResponse ?? '',
      body.RelayState,
      metadata,
    );
    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        sessionId: result.sessionId,
        user: result.user,
      },
    });
  }
}
