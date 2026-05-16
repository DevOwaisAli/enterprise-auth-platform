import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Transporter } from 'nodemailer';

import { type MailConfig, MAIL_CONFIG_KEY } from '@config/mail.config';

import { MAIL_TRANSPORTER } from './mail.constants';
import { type SendMailOptions, type SendMailResult } from './mail.types';

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
    const rendered = await this.renderTemplate(options);
    const info = await this.transporter.sendMail({
      from: `"${this.config.fromName}" <${this.config.from}>`,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo,
      subject: options.subject,
      text: rendered.text ?? options.text,
      html: rendered.html ?? options.html,
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

  private async renderTemplate(
    options: SendMailOptions,
  ): Promise<{ html?: string; text?: string }> {
    if (!options.template) {
      return {};
    }
    return { html: options.html, text: options.text };
  }
}
