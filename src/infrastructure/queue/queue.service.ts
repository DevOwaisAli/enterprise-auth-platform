import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { type JobsOptions, Queue } from 'bullmq';

import { QUEUE_NAMES, type QueueName } from './queue.constants';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues: Record<QueueName, Queue>;

  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.AUDIT) auditQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SECURITY_ALERT) securityAlertQueue: Queue,
  ) {
    this.queues = {
      [QUEUE_NAMES.EMAIL]: emailQueue,
      [QUEUE_NAMES.AUDIT]: auditQueue,
      [QUEUE_NAMES.NOTIFICATION]: notificationQueue,
      [QUEUE_NAMES.SECURITY_ALERT]: securityAlertQueue,
    };
  }

  getQueue(name: QueueName): Queue {
    return this.queues[name];
  }

  async enqueue<TPayload>(
    name: QueueName,
    jobName: string,
    payload: TPayload,
    options?: JobsOptions,
  ): Promise<string> {
    const queue = this.getQueue(name);
    const job = await queue.add(jobName, payload, options);
    this.logger.debug(`Enqueued ${name}:${jobName} (jobId=${job.id ?? 'unknown'})`);
    return job.id ?? '';
  }

  async getCounts(name: QueueName): Promise<Record<string, number>> {
    return this.getQueue(name).getJobCounts();
  }
}
