import { Global, Module } from '@nestjs/common';

import { mailTransporterProvider } from './mail.provider';
import { MailService } from './mail.service';

@Global()
@Module({
  providers: [mailTransporterProvider, MailService],
  exports: [MailService],
})
export class MailModule {}
