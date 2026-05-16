import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';

import { QUEUE_NAMES } from '@infrastructure/queue';

import { MailProcessor } from './mail.processor';
import { mailTransporterProvider } from './mail.provider';
import { MailService } from './mail.service';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.EMAIL })],
  providers: [mailTransporterProvider, MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
