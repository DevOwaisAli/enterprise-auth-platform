import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import { type MailConfig, MAIL_CONFIG_KEY } from '@config/mail.config';

import { MAIL_TRANSPORTER } from './mail.constants';

export const mailTransporterProvider: Provider = {
  provide: MAIL_TRANSPORTER,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Transporter => {
    const logger = new Logger('MailTransporter');
    const config = configService.getOrThrow<MailConfig>(MAIL_CONFIG_KEY);

    const transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth:
        config.user && config.password ? { user: config.user, pass: config.password } : undefined,
    });

    void transporter
      .verify()
      .then(() => logger.log(`Mail transporter ready (${config.host}:${config.port})`))
      .catch((error: Error) => logger.warn(`Mail transporter verify failed: ${error.message}`));

    return transporter;
  },
};
