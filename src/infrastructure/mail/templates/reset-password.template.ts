import { type ResetPasswordJobData } from '../mail.types';

import { escapeAttr, escapeHtml } from './escape';
import { htmlLayout } from './layout';
import { type RenderedMail } from './verify-email.template';

export function renderResetPassword(data: ResetPasswordJobData): RenderedMail {
  const greet = data.firstName ? `Hi ${escapeHtml(data.firstName)},` : 'Hello,';
  const expiresAtText = new Date(data.expiresAt).toUTCString();

  const html = htmlLayout(
    [
      `<h2 style="margin:0 0 16px;font-size:20px;">Reset your password</h2>`,
      `<p style="margin:0 0 12px;">${greet}</p>`,
      `<p style="margin:0 0 12px;">We received a request to reset your password. If you didn't make this request, you can ignore this email.</p>`,
      `<p style="margin:24px 0;"><a href="${escapeAttr(data.resetUrl)}" style="background:#101828;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;">Reset password</a></p>`,
      `<p style="margin:0 0 8px;font-size:13px;color:#475467;">Or paste this link into your browser:</p>`,
      `<p style="margin:0 0 16px;font-size:13px;word-break:break-all;"><a href="${escapeAttr(data.resetUrl)}">${escapeHtml(data.resetUrl)}</a></p>`,
      `<p style="margin:0;font-size:13px;color:#475467;">This link expires at ${escapeHtml(expiresAtText)}.</p>`,
    ].join('\n'),
  );

  const text = [
    data.firstName ? `Hi ${data.firstName},` : 'Hello,',
    '',
    "We received a request to reset your password. If you didn't make this request, you can ignore this email.",
    '',
    data.resetUrl,
    '',
    `This link expires at ${expiresAtText}.`,
  ].join('\n');

  return { subject: 'Reset your password', html, text };
}
