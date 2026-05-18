import { type OrganizationInvitationJobData } from '../mail.types';

import { escapeAttr, escapeHtml } from './escape';
import { htmlLayout } from './layout';
import { type RenderedMail } from './verify-email.template';

export function renderOrganizationInvitation(data: OrganizationInvitationJobData): RenderedMail {
  const expiresAtText = new Date(data.expiresAt).toUTCString();
  const orgName = escapeHtml(data.organizationName);
  const html = htmlLayout(
    [
      `<h2 style="margin:0 0 16px;font-size:20px;">You're invited to ${orgName}</h2>`,
      `<p style="margin:0 0 12px;">You've been invited to join <strong>${orgName}</strong>.</p>`,
      `<p style="margin:24px 0;"><a href="${escapeAttr(data.acceptUrl)}" style="background:#101828;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;">Accept invitation</a></p>`,
      `<p style="margin:0 0 8px;font-size:13px;color:#475467;">Or paste this link into your browser:</p>`,
      `<p style="margin:0 0 16px;font-size:13px;word-break:break-all;"><a href="${escapeAttr(data.acceptUrl)}">${escapeHtml(data.acceptUrl)}</a></p>`,
      `<p style="margin:0;font-size:13px;color:#475467;">This invitation expires at ${escapeHtml(expiresAtText)}.</p>`,
    ].join('\n'),
  );

  const text = [
    `You've been invited to join ${data.organizationName}.`,
    '',
    data.acceptUrl,
    '',
    `This invitation expires at ${expiresAtText}.`,
  ].join('\n');

  return { subject: `Invitation to join ${data.organizationName}`, html, text };
}
