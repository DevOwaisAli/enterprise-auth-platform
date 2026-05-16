import { type PasswordChangedJobData } from '../mail.types';

import { escapeHtml } from './escape';
import { htmlLayout } from './layout';
import { type RenderedMail } from './verify-email.template';

export function renderPasswordChanged(data: PasswordChangedJobData): RenderedMail {
  const greet = data.firstName ? `Hi ${escapeHtml(data.firstName)},` : 'Hello,';
  const changedAtText = new Date(data.changedAt).toUTCString();
  const ip = data.ipAddress ?? 'unknown IP';
  const ua = data.userAgent ?? 'unknown device';

  const html = htmlLayout(
    [
      `<h2 style="margin:0 0 16px;font-size:20px;">Your password was changed</h2>`,
      `<p style="margin:0 0 12px;">${greet}</p>`,
      `<p style="margin:0 0 12px;">Your password was changed on ${escapeHtml(changedAtText)} from ${escapeHtml(ip)} (${escapeHtml(ua)}).</p>`,
      `<p style="margin:0 0 12px;">If you did not make this change, reset your password and revoke all sessions immediately.</p>`,
    ].join('\n'),
  );

  const text = [
    data.firstName ? `Hi ${data.firstName},` : 'Hello,',
    '',
    `Your password was changed on ${changedAtText} from ${ip} (${ua}).`,
    '',
    'If you did not make this change, reset your password and revoke all sessions immediately.',
  ].join('\n');

  return { subject: 'Your password was changed', html, text };
}
