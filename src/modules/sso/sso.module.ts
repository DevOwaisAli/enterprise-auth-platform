import { Module } from '@nestjs/common';

import { AuthModule } from '@modules/auth/auth.module';
import { AuthorizationModule } from '@modules/authorization';
import { MfaModule } from '@modules/mfa/mfa.module';

import { SsoConfigurationController, SsoLoginController } from './controllers';
import {
  JitProvisioningService,
  SamlProviderService,
  SsoConfigurationService,
  SsoEnforcementService,
  SsoLoginService,
} from './services';

@Module({
  imports: [AuthModule, AuthorizationModule, MfaModule],
  controllers: [SsoConfigurationController, SsoLoginController],
  providers: [
    SsoConfigurationService,
    SamlProviderService,
    JitProvisioningService,
    SsoLoginService,
    SsoEnforcementService,
  ],
  exports: [SsoConfigurationService, SsoLoginService],
})
export class SsoModule {}
