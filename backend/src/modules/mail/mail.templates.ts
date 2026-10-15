import type { OutboundEmail } from './mail.service';

const BRAND = 'NationWide Logistics';
// The brand oxblood, same value as CompanySettings.primaryColor's default and globals.css.
const ACCENT = '#7F1020';
const INK = '#0b0b0c';
const BODY_INK = '#3f3f46';
const MUTED_INK = '#71717a';

/**
 * Neumorphic ("soft UI") surfaces: one zinc-tinted base colour everywhere, and depth made only of
 * a light shadow up-left plus a dark one down-right. Raised for the card and button, pressed in
 * for the details panel. Outlook ignores box-shadow, so each surface also carries a hairline
 * border: there it reads as a plain bordered card, which is the right way to fail.
 */
const BASE = '#eef0f3';
const RAISED =
  'box-shadow:9px 9px 18px #cfd2d8,-9px -9px 18px #ffffff;border:1px solid #e4e6ea;';
const PRESSED =
  'box-shadow:inset 4px 4px 9px #d3d6dc,inset -4px -4px 9px #ffffff;border:1px solid #e4e6ea;';
const FONT = "Poppins,'Segoe UI',Arial,Helvetica,sans-serif";
const MONO = "'Geist Mono',SFMono-Regular,Consolas,'Courier New',monospace";

/**
 * The header logo, as an absolute URL on the public site.
 *
 * Absolute because an email client has no origin to resolve a relative path against, and served
 * rather than attached because a CID image would turn every send into a multipart upload for one
 * 4KB mark. The mark is black on transparent, which is why it sits on the light base rather than
 * on a brand-red band. Most clients block remote images by default, so the wordmark next to it
 * stays as live text and the alt text carries the brand when the image never loads.
 */
const LOGO_URL = `${process.env.PUBLIC_FRONTEND_URL?.replace(/\/+$/, '') ?? 'https://nationwidelogistics.co'}/assets/logo/logo-mark.png`;

/** Email clients strip <style> blocks and ignore most CSS, so everything here is inline. */
function shell(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:${BASE};font-family:${FONT};color:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BASE};padding:32px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 6px 22px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle;">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="background:${BASE};border-radius:14px;padding:7px;${RAISED}">
                  <img src="${LOGO_URL}" width="30" height="30" alt="${BRAND}"
                       style="display:block;width:30px;height:30px;border:0;outline:none;text-decoration:none;">
                </td>
              </tr></table>
            </td>
            <td style="vertical-align:middle;padding-left:14px;">
              <span style="color:${INK};font-size:16px;font-weight:600;letter-spacing:.01em;">${BRAND}</span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="background:${BASE};border-radius:24px;padding:34px 30px;${RAISED}">
          <div style="width:36px;height:4px;border-radius:4px;background:${ACCENT};margin:0 0 18px;line-height:4px;font-size:0;">&nbsp;</div>
          <h1 style="margin:0 0 18px;font-size:21px;line-height:1.3;font-weight:600;color:${INK};">${heading}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:24px 8px 0;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED_INK};">
            Sent by ${BRAND}, Hyderabad. If this was not expected, you can ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
  <tr><td style="background:${ACCENT};border-radius:14px;box-shadow:6px 6px 14px #cfd2d8,-6px -6px 14px #ffffff;">
    <a href="${href}" style="display:inline-block;padding:14px 26px;color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;text-decoration:none;border-radius:14px;">${label}</a>
  </td></tr></table>`;
}

const P = `margin:0 0 14px;font-size:15px;line-height:1.65;color:${BODY_INK};`;
const MUTED = `margin:0 0 8px;font-size:13px;line-height:1.6;color:${MUTED_INK};`;

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:7px 0;font-size:13px;color:${MUTED_INK};width:110px;vertical-align:top;">${label}</td>
    <td style="padding:7px 0;font-size:14px;color:${INK};word-break:break-all;">${value}</td>
  </tr>`;
}

/** A pressed-in panel for key/value details: reads as "this is the part to copy". */
function details(rows: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:20px 0;"><tr>
    <td style="background:${BASE};border-radius:16px;padding:14px 18px;${PRESSED}">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${rows}</table>
    </td></tr></table>`;
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
// 0. Standing ordering link — sent to the business that will use it
// ---------------------------------------------------------------------------

export interface B2bLinkEmailInput {
  email: string;
  /** The business the shipments are billed to. */
  companyName: string;
  /** Who it was addressed to, when the admin recorded a name. */
  contactName?: string | null;
  /** What the link is for, e.g. "Bengaluru warehouse". */
  label: string;
  url: string;
}

/**
 * The link itself, mailed to the business.
 *
 * The URL is the credential — anyone holding it can book shipments billed to this account — so the
 * mail says so plainly rather than reading like a newsletter. It is sent once, at the moment the
 * admin issues it: the server keeps only a hash, so it cannot be re-sent later.
 */
export function b2bLinkIssued(input: B2bLinkEmailInput): OutboundEmail {
  const greeting = input.contactName
    ? escapeHtml(input.contactName)
    : escapeHtml(input.companyName);
  return {
    to: input.email,
    subject: `Your NationWide ordering link — ${input.label}`,
    html: shell(
      'Your ordering link',
      `<p style="${P}">Hello ${greeting},</p>
       <p style="${P}">Here is your NationWide ordering link for
        <strong>${escapeHtml(input.label)}</strong>. Open it to request pickups billed to
        ${escapeHtml(input.companyName)} — several shipments in one collection, with your addresses
        and regular contents saved for next time. No password needed.</p>
       ${button(input.url, 'Open your ordering link')}
       <p style="${MUTED}">Treat this link like a key: anyone who has it can place orders on your
        account. Keep it to the people who need it, and tell us if it goes astray — we will cancel
        it and issue another.</p>`,
    ),
    text: `Your NationWide ordering link

Hello ${input.contactName ?? input.companyName},

Here is your ordering link for ${input.label}. Open it to request pickups billed to
${input.companyName} — no password needed:

${input.url}

Treat this link like a key: anyone who has it can place orders on your account. Tell us if it
goes astray and we will cancel it and issue another.`,
  };
}

// ---------------------------------------------------------------------------
// 1. B2B portal invitation — sent to the business by an admin
// ---------------------------------------------------------------------------

export interface B2bInviteEmailInput {
  companyName: string;
  email: string;
  setPasswordUrl: string;
  portalUrl: string;
  expiresInDays: number;
}

/**
 * The only way onto the B2B portal. Carries a set-password link, which is a password-reset grant
 * (see B2bAccountsService) — so it expires, works once, and never contains a password.
 */
export function b2bInvite(input: B2bInviteEmailInput): OutboundEmail {
  const company = escapeHtml(input.companyName);
  return {
    to: input.email,
    subject: 'Your NationWide business account',
    html: shell(
      'Your business account is ready',
      `<p style="${P}">Hello ${company},</p>
       <p style="${P}">We have set up a NationWide business account for you. Choose a password to
        activate it, then sign in to book pickups: many shipments in one collection, with your
        addresses and regular contents saved for next time.</p>
       ${button(input.setPasswordUrl, 'Set your password')}
       <p style="${MUTED}">This link expires in ${input.expiresInDays} days and can be used once.
        Afterwards, sign in any time at ${escapeHtml(input.portalUrl)}.</p>
       <p style="${MUTED}">If you were not expecting this, ignore this email and nothing will
        change.</p>`,
    ),
    text: `Your NationWide business account

Hello ${input.companyName},

We have set up a business account for you. Choose a password to activate it:

${input.setPasswordUrl}

This link expires in ${input.expiresInDays} days and can be used once. Afterwards, sign in at
${input.portalUrl}.

If you were not expecting this, ignore this email.`,
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
      `<p style="${P}">Hi ${name}, your shipment <strong style="font-family:${MONO};">${awb}</strong> has been delivered.</p>
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
  const rows = [
    row('Name', name),
    row('Email', escapeHtml(input.email)),
    row(
      'Password',
      `<code style="font-family:${MONO};font-size:14px;">${escapeHtml(input.password)}</code>`,
    ),
  ].join('');

  return {
    to: input.email,
    toName: input.name,
    subject: 'Your NationWide pickup partner account',
    html: shell(
      'Your partner account is ready',
      `<p style="${P}">Hi ${firstName}, an account has been created for you as a NationWide pickup partner. Sign in with the details below.</p>
       ${details(rows)}
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
