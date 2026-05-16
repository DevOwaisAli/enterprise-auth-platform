export const QUEUE_NAMES = {
  EMAIL: 'email',
  AUDIT: 'audit',
  NOTIFICATION: 'notification',
  SECURITY_ALERT: 'security-alert',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const ALL_QUEUE_NAMES: QueueName[] = Object.values(QUEUE_NAMES);
