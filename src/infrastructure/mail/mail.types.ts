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
  template?: {
    name: string;
    context: Record<string, unknown>;
  };
}

export interface SendMailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}
