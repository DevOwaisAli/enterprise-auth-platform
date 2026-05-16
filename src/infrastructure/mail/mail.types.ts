export interface MailAttachment {
  filename: string;
  content?: string | Buffer;
  path?: string;
  contentType?: string;
}

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: MailAttachment[];
}

export interface SendMailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export enum MailJobType {
  VERIFY_EMAIL = 'verify-email',
  RESET_PASSWORD = 'reset-password',
  PASSWORD_CHANGED = 'password-changed',
}

export interface VerifyEmailJobData {
  to: string;
  firstName: string | null;
  verifyUrl: string;
  expiresAt: string;
}

export interface ResetPasswordJobData {
  to: string;
  firstName: string | null;
  resetUrl: string;
  expiresAt: string;
}

export interface PasswordChangedJobData {
  to: string;
  firstName: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  changedAt: string;
}

export type MailJobData = VerifyEmailJobData | ResetPasswordJobData | PasswordChangedJobData;
