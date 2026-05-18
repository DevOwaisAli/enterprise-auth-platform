import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './controllers/auth.controller';
import { SessionController } from './controllers/session.controller';
import { ActiveContextService } from './services/active-context.service';
import { AuthService } from './services/auth.service';
import { PasswordService } from './services/password.service';
import { SessionService } from './services/session.service';
import { TokenService } from './services/token.service';
import { VerificationService } from './services/verification.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController, SessionController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    TokenService,
    VerificationService,
    ActiveContextService,
    JwtStrategy,
  ],
  exports: [AuthService, TokenService, SessionService, ActiveContextService],
})
export class AuthModule {}
