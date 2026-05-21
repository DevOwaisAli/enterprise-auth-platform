import { Module } from '@nestjs/common';

import { AuthModule } from '@modules/auth/auth.module';
import { MfaModule } from '@modules/mfa/mfa.module';

import { OAuthController } from './controllers';
import { OAuthFlowService, OAuthService, OAuthStateService } from './services';
import {
  GitHubOAuthStrategy,
  GoogleOAuthStrategy,
  MicrosoftOAuthStrategy,
  OAuthProviderRegistry,
} from './strategies';

@Module({
  imports: [AuthModule, MfaModule],
  controllers: [OAuthController],
  providers: [
    OAuthService,
    OAuthFlowService,
    OAuthStateService,
    OAuthProviderRegistry,
    GoogleOAuthStrategy,
    GitHubOAuthStrategy,
    MicrosoftOAuthStrategy,
  ],
  exports: [OAuthService],
})
export class OAuthModule {}
