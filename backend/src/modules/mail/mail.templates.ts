import type { OutboundEmail } from './mail.service';

const BRAND = 'NationWide Logistics';
// The brand maroon, same value as CompanySettings.primaryColor's default.
const ACCENT = '#7F1020';

/**
 * The header logo, as an absolute URL on the public site.
 *
 * Absolute because an email client has no origin to resolve a relative path against, and served
 * rather than attached because a CID image would turn every send into a multipart upload for one
 * 4KB mark. The transparent-background PNG is the one that works here: it sits directly on the
 * maroon band, and a white-boxed logo on a coloured header is the usual giveaway of a template
 * nobody looked at. Most clients block remote images by default, so the wordmark next to it stays
 * as live text and the alt text carries the brand when the image never loads.
 */
const LOGO_URL = `${process.env.PUBLIC_FRONTEND_URL?.replace(/\/+$/, '') ?? 'https://nationwidelogistics.co'}/assets/logo/logo-mark.png`;

/** Email clients strip <style> blocks and ignore most CSS, so everything here is inline. */
function shell(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:#f4f1f0;font-family:Arial,Helvetica,sans-serif;color:#1c1517;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f0;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:${ACCENT};padding:18px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:10px;vertical-align:middle;">
              <img src="${LOGO_URL}" width="32" height="32" alt="${BRAND}"
                   style="display:block;width:32px;height:32px;border:0;outline:none;text-decoration:none;">
            </td>
            <td style="vertical-align:middle;">
              <span style="color:#ffffff;font-size:17px;font-weight:bold;letter-spacing:.02em;">${BRAND}</span>
            </td>
          </tr></table>
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

// ---------------------------------------------------------------------------
// 4. Post-delivery feedback request
// ---------------------------------------------------------------------------

export function feedbackRequest(
  to: string,
  customerName: string,
  trackingNumber: string,
  feedbackUrl: string,
): OutboundEmail {
  const name = escapeHtml(customerName.split(' ')[0] || 'there');
  const awb = escapeHtml(trackingNumber);
  return {
    to,
    toName: customerName,
    subject: `How did we do? Shipment ${trackingNumber}`,
    html: shell(
      'How did we do?',
      `<p style="${P}">Hi ${name}, your shipment <strong>${awb}</strong> has been delivered.</p>
       <p style="${P}">If you have a moment, tell us how it went. It takes about thirty seconds and it genuinely shapes how we run the service.</p>
       ${button(feedbackUrl, 'Leave feedback')}
       <p style="${MUTED}">This link is for your shipment only and works once.</p>`,
    ),
    text: `Hi ${customerName.split(' ')[0] || 'there'},

Your shipment ${trackingNumber} has been delivered.

If you have a moment, tell us how it went — it takes about thirty seconds:
${feedbackUrl}

This link is for your shipment only and works once.`,
  };
}

// ---------------------------------------------------------------------------
// 5. A pickup-partner account created for someone — their name and first password
// ---------------------------------------------------------------------------

export interface PartnerCredentialsEmailInput {
  name: string;
  email: string;
  /** Plain text, on purpose: this is the one and only time it can be shown. */
  password: string;
  loginUrl: string;
}

/**
 * The account-created mail for a pickup partner.
 *
 * The password is sent in plain text because there is nothing else to send — the account is
 * created for them, so there is no existing credential to authenticate a reset link against.
 * It is stored only as a bcrypt hash, is never logged, and the mail tells them to change it.
 */
export function pickupPartnerCredentials(
  input: PartnerCredentialsEmailInput,
): OutboundEmail {
  const name = escapeHtml(input.name);
  const firstName = name.split(' ')[0] || 'there';
  const details = [
    row('Name', name),
    row('Email', escapeHtml(input.email)),
    row('Password', `<code style="font-family:monospace;font-size:14px;">${escapeHtml(input.password)}</code>`),
  ].join('');

  return {
    to: input.email,
    toName: input.name,
    subject: 'Your NationWide pickup partner account',
    html: shell(
      'Your partner account is ready',
      `<p style="${P}">Hi ${firstName}, an account has been created for you as a NationWide pickup partner. Sign in with the details below.</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0;">${details}</table>
       ${button(input.loginUrl, 'Sign in')}
       <p style="${P}">Please change this password after your first sign-in.</p>
       <p style="${MUTED}">If you were not expecting this, let us know and we will remove the account.</p>`,
    ),
    text: `Hi ${input.name.split(' ')[0] || 'there'},

An account has been created for you as a NationWide pickup partner.

Name:     ${input.name}
Email:    ${input.email}
Password: ${input.password}

Sign in: ${input.loginUrl}

Please change this password after your first sign-in.

If you were not expecting this, let us know and we will remove the account.`,
  };
}
