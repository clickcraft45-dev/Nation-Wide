import type { OutboundEmail } from './mail.service';

const BRAND = 'NationWide Logistics';
// The brand maroon, same value as CompanySettings.primaryColor's default.
const ACCENT = '#7F1020';

/** Email clients strip <style> blocks and ignore most CSS, so everything here is inline. */
function shell(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:#f4f1f0;font-family:Arial,Helvetica,sans-serif;color:#1c1517;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f0;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:${ACCENT};padding:20px 28px;">
          <span style="color:#ffffff;font-size:17px;font-weight:bold;letter-spacing:.02em;">${BRAND}</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1c1517;">${heading}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 28px;background:#faf8f7;border-top:1px solid #e6dedc;">
          <p style="margin:0;font-size:12px;color:#8c7f82;">
            Sent by ${BRAND}. If this was not expected, you can ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
  <tr><td style="background:${ACCENT};border-radius:6px;">
    <a href="${href}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">${label}</a>
  </td></tr></table>`;
}

const P = 'margin:0 0 12px;font-size:15px;line-height:1.6;color:#3d3336;';
const MUTED = 'margin:0;font-size:13px;line-height:1.6;color:#8c7f82;';

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:14px;color:#8c7f82;width:130px;">${label}</td>
    <td style="padding:6px 0;font-size:14px;color:#1c1517;">${value}</td>
  </tr>`;
}

/** Values land inside HTML — an applicant controls all of them, so none may render as markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// 1. New pickup-partner application — internal alert to the operations inbox
// ---------------------------------------------------------------------------

export interface PartnerApplicationEmailInput {
  name: string;
  email: string;
  phone: string;
  serviceArea: string;
  note?: string | null;
  reviewUrl: string;
}

export function partnerApplicationReceived(
  input: PartnerApplicationEmailInput,
  to: string,
): OutboundEmail {
  const name = escapeHtml(input.name);
  const details = [
    row('Name', name),
    row('Email', escapeHtml(input.email)),
    row('Phone', escapeHtml(input.phone)),
    row('Service area', escapeHtml(input.serviceArea)),
    input.note ? row('Note', escapeHtml(input.note)) : '',
  ].join('');

  return {
    to,
    subject: `New pickup partner application — ${input.name}`,
    // Replying goes to the applicant, so ops can answer without copying the address out.
    replyTo: input.email,
    html: shell(
      'New pickup partner application',
      `<p style="${P}">Someone applied to become a pickup partner. Approving creates their partner account; rejecting leaves no account behind.</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0;">${details}</table>
       ${button(input.reviewUrl, 'Review application')}
       <p style="${MUTED}">You are receiving this because you are on the NationWide operations inbox.</p>`,
    ),
    text: `New pickup partner application

Name:         ${input.name}
Email:        ${input.email}
Phone:        ${input.phone}
Service area: ${input.serviceArea}${input.note ? `\nNote:         ${input.note}` : ''}

Review it: ${input.reviewUrl}`,
  };
}

// ---------------------------------------------------------------------------
// 2. Forgot password
// ---------------------------------------------------------------------------

export function passwordReset(
  to: string,
  resetUrl: string,
  expiresInMinutes: number,
): OutboundEmail {
  return {
    to,
    subject: 'Reset your NationWide password',
    html: shell(
      'Reset your password',
      `<p style="${P}">We received a request to reset the password for this address. Choose a new one using the button below.</p>
       ${button(resetUrl, 'Choose a new password')}
       <p style="${P}">This link works once and expires in ${expiresInMinutes} minutes.</p>
       <p style="${MUTED}">If you did not ask for this, nothing has changed and you can ignore this email. Your current password still works.</p>`,
    ),
    text: `Reset your NationWide password

Open this link to choose a new password:
${resetUrl}

The link works once and expires in ${expiresInMinutes} minutes.

If you did not ask for this, nothing has changed — your current password still works.`,
  };
}

// ---------------------------------------------------------------------------
// 3. Manual send — an admin composing a one-off message
// ---------------------------------------------------------------------------

export function manualMessage(
  to: string,
  subject: string,
  bodyText: string,
  replyTo?: string,
): OutboundEmail {
  // Admin-authored plain text rendered into the branded shell. Escaped, then newlines become
  // paragraphs — so a pasted body can never inject markup, and blank lines still read as breaks.
  const paragraphs = escapeHtml(bodyText)
    .split(/\n{2,}/)
    .map((block) => `<p style="${P}">${block.replace(/\n/g, '<br>')}</p>`)
    .join('');

  return {
    to,
    subject,
    ...(replyTo ? { replyTo } : {}),
    html: shell(subject, paragraphs),
    text: bodyText,
  };
}
