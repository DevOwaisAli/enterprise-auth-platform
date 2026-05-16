import { type VerifyEmailJobData } from '../mail.types';

import { escapeAttr, escapeHtml } from './escape';
import { htmlLayout } from './layout';

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}

export function renderVerifyEmail(data: VerifyEmailJobData): RenderedMail {
  const greet = data.firstName ? `Hi ${escapeHtml(data.firstName)},` : 'Hello,';
  const expiresAtText = new Date(data.expiresAt).toUTCString();

  const html = htmlLayout(
    [
      `<h2 style="margin:0 0 16px;font-size:20px;">Verify your email</h2>`,
      `<p style="margin:0 0 12px;">${greet}</p>`,
      `<p style="margin:0 0 12px;">Confirm your email address to finish setting up your account.</p>`,
      `<p style="margin:24px 0;"><a href="${escapeAttr(data.verifyUrl)}" style="background:#101828;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;">Verify email</a></p>`,
      `<p style="margin:0 0 8px;font-size:13px;color:#475467;">Or paste this link into your browser:</p>`,
      `<p style="margin:0 0 16px;font-size:13px;word-break:break-all;"><a href="${escapeAttr(data.verifyUrl)}">${escapeHtml(data.verifyUrl)}</a></p>`,
      `<p style="margin:0;font-size:13px;color:#475467;">This link expires at ${escapeHtml(expiresAtText)}.</p>`,
    ].join('\n'),
  );

  const text = [
    data.firstName ? `Hi ${data.firstName},` : 'Hello,',
    '',
    'Confirm your email address to finish setting up your account.',
    '',
    data.verifyUrl,
    '',
    `This link expires at ${expiresAtText}.`,
  ].join('\n');

  return { subject: 'Verify your email', html, text };
}
