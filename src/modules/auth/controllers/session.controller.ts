import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { type AuthenticatedUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@common/guards';

import { SessionResponseDto } from '../dto';
import { AuthService } from '../services/auth.service';
import { SessionService } from '../services/session.service';

@ApiTags('Sessions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'auth/sessions' })
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List active sessions for the authenticated user' })
  @ApiOkResponse({ type: SessionResponseDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<SessionResponseDto[]> {
    const sessions = await this.sessionService.listActiveSessionsForUser(user.id);
    return sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      deviceName: session.deviceName,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      isCurrent: session.id === user.sessionId,
    }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a specific session' })
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) sessionId: string,
  ): Promise<void> {
    if (sessionId === user.sessionId) {
      await this.authService.logout(user.id, sessionId);
      return;
    }
    await this.sessionService.revokeSession(sessionId, user.id);
  }
}
