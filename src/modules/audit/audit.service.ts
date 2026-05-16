import { Injectable, Logger } from '@nestjs/common';

import { RequestContext } from '@common/utils/request-context';
import { QUEUE_NAMES, QueueService } from '@infrastructure/queue';

import { type AuditAction, type AuditEvent, type AuditResource } from './audit.types';

export interface RecordAuditOptions {
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  status?: 'success' | 'failure';
  actor?: { userId?: string; email?: string };
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly queueService: QueueService) {}

  async record(options: RecordAuditOptions): Promise<void> {
    const event = this.buildEvent(options);
    try {
      await this.queueService.enqueue(QUEUE_NAMES.AUDIT, event.action, event);
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue audit event ${event.action}: ${(error as Error).message}`,
      );
    }
  }

  private buildEvent(options: RecordAuditOptions): AuditEvent {
    const ctx = RequestContext.get();
    return {
      action: options.action,
      resource: options.resource,
      resourceId: options.resourceId,
      status: options.status ?? 'success',
      actor: {
        userId: options.actor?.userId ?? ctx?.userId,
        email: options.actor?.email,
        ip: ctx?.ip,
        userAgent: ctx?.userAgent,
      },
      metadata: options.metadata,
      correlationId: ctx?.correlationId,
      timestamp: new Date().toISOString(),
    };
  }
}
