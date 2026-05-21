import { forwardRef, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationModule } from '@modules/authorization';

import { MfaChallengeController, MfaController, OrgMfaPolicyController } from './controllers';
import { MfaRequiredGuard } from './guards';
import {
  MfaChallengeService,
  MfaLoginService,
  MfaPolicyService,
  MfaService,
  SecretsCryptoService,
  TotpService,
} from './services';

@Module({
  imports: [forwardRef(() => AuthModule), AuthorizationModule, JwtModule.register({})],
  controllers: [MfaController, MfaChallengeController, OrgMfaPolicyController],
  providers: [
    MfaService,
    MfaChallengeService,
    MfaLoginService,
    MfaPolicyService,
    SecretsCryptoService,
    TotpService,
    MfaRequiredGuard,
  ],
  exports: [
    MfaService,
    MfaChallengeService,
    MfaLoginService,
    MfaPolicyService,
    SecretsCryptoService,
    MfaRequiredGuard,
  ],
})
export class MfaModule {}
