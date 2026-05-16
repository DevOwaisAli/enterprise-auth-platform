import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Transporter } from 'nodemailer';

import { type MailConfig, MAIL_CONFIG_KEY } from '@config/mail.config';

import { MAIL_TRANSPORTER } from './mail.constants';
import {
  type MailJobData,
  MailJobType,
  type PasswordChangedJobData,
  type ResetPasswordJobData,
  type SendMailOptions,
  type SendMailResult,
  type VerifyEmailJobData,
} from './mail.types';
import { renderPasswordChanged, renderResetPassword, renderVerifyEmail } from './templates';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly config: MailConfig;

  constructor(
    @Inject(MAIL_TRANSPORTER) private readonly transporter: Transporter,
    configService: ConfigService,
  ) {
    this.config = configService.getOrThrow<MailConfig>(MAIL_CONFIG_KEY);
  }

  async sendMail(options: SendMailOptions): Promise<SendMailResult> {
    const info = await this.transporter.sendMail({
      from: `"${this.config.fromName}" <${this.config.from}>`,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    });

    this.logger.log(
      `Mail sent to ${Array.isArray(options.to) ? options.to.join(',') : options.to} (id=${info.messageId})`,
    );

    return {
      messageId: info.messageId,
      accepted: (info.accepted ?? []).map(String),
      rejected: (info.rejected ?? []).map(String),
    };
  }

  async dispatch(type: MailJobType, data: MailJobData): Promise<SendMailResult> {
    switch (type) {
      case MailJobType.VERIFY_EMAIL: {
        const payload = data as VerifyEmailJobData;
        const rendered = renderVerifyEmail(payload);
        return this.sendMail({ to: payload.to, ...rendered });
      }
      case MailJobType.RESET_PASSWORD: {
        const payload = data as ResetPasswordJobData;
        const rendered = renderResetPassword(payload);
        return this.sendMail({ to: payload.to, ...rendered });
      }
      case MailJobType.PASSWORD_CHANGED: {
        const payload = data as PasswordChangedJobData;
        const rendered = renderPasswordChanged(payload);
        return this.sendMail({ to: payload.to, ...rendered });
      }
      default: {
        const exhaustiveCheck: never = type;
        throw new Error(`Unknown mail job type: ${String(exhaustiveCheck)}`);
      }
    }
  }
}
