import { Global, Module } from '@nestjs/common';

import { QueueModule } from '@infrastructure/queue';

import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [QueueModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
