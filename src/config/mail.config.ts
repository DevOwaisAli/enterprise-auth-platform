import { registerAs } from '@nestjs/config';

export const MAIL_CONFIG_KEY = 'mail';

export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  fromName: string;
}

export default registerAs<MailConfig>(MAIL_CONFIG_KEY, () => ({
  host: process.env.MAIL_HOST ?? 'localhost',
  port: Number(process.env.MAIL_PORT ?? 587),
  secure: process.env.MAIL_SECURE === 'true',
  user: process.env.MAIL_USER ? process.env.MAIL_USER : undefined,
  password: process.env.MAIL_PASSWORD ? process.env.MAIL_PASSWORD : undefined,
  from: process.env.MAIL_FROM ?? 'no-reply@example.com',
  fromName: process.env.MAIL_FROM_NAME ?? 'Enterprise Auth Platform',
}));
