import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job } from 'bullmq';

import { QUEUE_NAMES } from '@infrastructure/queue';

import { MailService } from './mail.service';
import { type MailJobData, MailJobType } from './mail.types';

@Processor(QUEUE_NAMES.EMAIL)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  override async process(job: Job<MailJobData, void, string>): Promise<void> {
    const type = job.name as MailJobType;
    try {
      await this.mailService.dispatch(type, job.data);
    } catch (error) {
      this.logger.error(
        `Mail job ${type} (id=${job.id ?? 'unknown'}) failed: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
