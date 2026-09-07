import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { isEmailConfigured, sendEmail } from './emailTransport.js';
import { env } from '../config/env.js';
import { getFirebaseAdmin } from '../auth/firebaseAdmin.js';
import { toAppAuthActionLink } from './authActionLink.js';
import {
  clearVerificationActionUrl,
  peekVerificationActionUrl,
  rememberVerificationActionUrl,
  isTooManyVerificationAttempts,
  isVerificationGenerateBlocked,
  markVerificationGenerateBlocked
} from './verificationLinkCache.js';
import type { ResultsReadyLinks } from './resultsReadyNotification.js';
import type { SessionRecapEmail } from './sessionRecapEmail.js';

export { isEmailConfigured } from './emailTransport.js';

function resolveEmailAsset(filename: string) {
  const candidates = [
    path.join(__dirname, '../emails', filename),
    path.join(process.cwd(), 'src/emails', filename),
    path.join(process.cwd(), 'emails', filename)
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Missing email asset: ${filename}`);
}

async function sendOrThrow(label: string, send: () => Promise<void>) {
  try {
    await send();
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown Resend error';
    throw new Error(`${label}: ${detail.slice(0, 300)}`);
  }
}

/** Welcome email for brand-new signups. Requires Resend to be configured. */
export async function sendWelcomeEmail(options: { to: string; firstName?: string | null }) {
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured.');
  }

  const firstName = options.firstName?.trim();
  const nameSuffix =
    firstName && firstName.toLowerCase() !== 'metabolic' && firstName.toLowerCase() !== 'user'
      ? `, ${firstName}`
      : '';
  const appUrl = env.CLIENT_URL.replace(/\/$/, '');

  const html = readFileSync(resolveEmailAsset('welcome.html'), 'utf8')
    .replaceAll('{{nameSuffix}}', escapeHtml(nameSuffix))
    .replaceAll('{{appUrl}}', escapeHtml(appUrl));
  const image = readFileSync(resolveEmailAsset('welcome-dashboard.png'));
  const text = [
    `Welcome${nameSuffix} — your whole plan lives here.`,
    '',
    'Nutrition, training, body-comp tracking and coaching, all in one place.',
    '',
    '1. Coach & log by text — text START to opt in',
    '2. Your daily dashboard — macros, meals, workouts, weight trend',
    '3. Metabolic Blueprint — metrics, check-ins, progress photos',
    '4. Personalized nutrition — meal plan, logging, AI food lookup',
    '5. Guided training — daily/weekly workouts with how-to videos',
    '',
    `Open your dashboard: ${appUrl}`,
    '',
    '— Metabolic OS'
  ].join('\n');

  await sendOrThrow('Could not send welcome email', () =>
    sendEmail({
      to: options.to,
      subject: 'Welcome to Metabolic OS',
      text,
      html,
      attachments: [
        {
          name: 'welcome-dashboard.png',
          contentType: 'image/png',
          contentBytes: image.toString('base64'),
          contentId: 'welcome-dashboard',
          isInline: true
        }
      ]
    })
  );
}

function appOrigin() {
  return env.CLIENT_URL.replace(/\/$/, '');
}

function renderAuthActionEmail(replacements: {
  heading: string;
  preheader: string;
  body: string;
  buttonLabel: string;
  actionUrl: string;
  footerNote: string;
}) {
  let html = readFileSync(resolveEmailAsset('auth-action.html'), 'utf8');
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(`{{${key}}}`, escapeHtml(value));
  }
  return html;
}

async function sendAuthActionEmail(options: {
  to: string;
  subject: string;
  heading: string;
  preheader: string;
  body: string;
  buttonLabel: string;
  actionUrl: string;
  footerNote: string;
  text: string;
}) {
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured.');
  }
  const html = renderAuthActionEmail({
    heading: options.heading,
    preheader: options.preheader,
    body: options.body,
    buttonLabel: options.buttonLabel,
    actionUrl: options.actionUrl,
    footerNote: options.footerNote
  });
  await sendOrThrow(`Could not send ${options.subject.toLowerCase()}`, () =>
    sendEmail({
      to: options.to,
      subject: options.subject,
      text: options.text,
      html
    })
  );
}

/** Builds a Metabolic OS verification URL from a Firebase oob code. Does not send mail. */
export async function createEmailVerificationActionUrl(email: string, forceNew = false) {
  if (forceNew) {
    clearVerificationActionUrl(email);
  } else {
    const cached = peekVerificationActionUrl(email);
    if (cached) return cached;
  }
  if (isVerificationGenerateBlocked(email)) {
    const cached = peekVerificationActionUrl(email);
    if (cached) return cached;
    const error = new Error('TOO_MANY_ATTEMPTS_TRY_LATER');
    (error as Error & { code: string }).code = 'auth/too-many-requests';
    throw error;
  }
  try {
    const continueUrl = `${appOrigin()}/login`;
    const firebaseLink = await getFirebaseAdmin().auth().generateEmailVerificationLink(email, {
      url: continueUrl
    });
    const actionUrl = toAppAuthActionLink(firebaseLink, env.CLIENT_URL);
    rememberVerificationActionUrl(email, actionUrl);
    return actionUrl;
  } catch (error) {
    if (isTooManyVerificationAttempts(error)) {
      markVerificationGenerateBlocked(email);
    }
    throw error;
  }
}

/** Branded verification email whose button opens Metabolic OS, not Firebase's hosted page. */
export async function sendEmailVerificationLink(options: {
  email: string;
  firstName?: string | null;
  deliver?: boolean;
  forceNew?: boolean;
}): Promise<{ actionUrl: string; sent: boolean }> {
  const actionUrl = await createEmailVerificationActionUrl(options.email, options.forceNew);
  if (options.deliver === false || !isEmailConfigured()) {
    return { actionUrl, sent: false };
  }

  const firstName = options.firstName?.trim();
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

  await sendAuthActionEmail({
    to: options.email,
    subject: 'Verify your Metabolic OS email',
    heading: 'Verify your email',
    preheader: 'Confirm your email to finish setting up Metabolic OS.',
    body: `${greeting} Confirm this email address so we can reach you with your plan, coach messages, and account updates.`,
    buttonLabel: 'Verify email →',
    actionUrl,
    footerNote: "You're receiving this because you created a Metabolic OS account.",
    text: [
      'Verify your Metabolic OS email',
      '',
      `${greeting} Confirm this email address so we can reach you with your plan, coach messages, and account updates.`,
      '',
      `Verify: ${actionUrl}`,
      '',
      '— Metabolic OS'
    ].join('\n')
  });
  return { actionUrl, sent: true };
}

/** Branded password-reset email whose button opens Metabolic OS. */
export async function sendPasswordResetLink(options: { email: string }) {
  const continueUrl = `${appOrigin()}/login`;
  const firebaseLink = await getFirebaseAdmin().auth().generatePasswordResetLink(options.email, {
    url: continueUrl
  });
  const actionUrl = toAppAuthActionLink(firebaseLink, env.CLIENT_URL);

  await sendAuthActionEmail({
    to: options.email,
    subject: 'Reset your Metabolic OS password',
    heading: 'Choose a new password',
    preheader: 'Set a new password for your Metabolic OS account.',
    body: 'Use the button below to choose a new password. If you did not ask for this, you can ignore the email.',
    buttonLabel: 'Reset password →',
    actionUrl,
    footerNote: "You're receiving this because a password reset was requested for this email.",
    text: [
      'Reset your Metabolic OS password',
      '',
      'Use this link to choose a new password. If you did not ask for this, you can ignore the email.',
      '',
      `Reset: ${actionUrl}`,
      '',
      '— Metabolic OS'
    ].join('\n')
  });
}

export type { ResultsReadyLinks };

export async function sendResultsReadyEmail(options: {
  to: string;
  clientFirstName: string;
  coachName: string;
  links: ResultsReadyLinks;
}) {
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured.');
  }

  const subject = 'Your results are ready';
  const greeting = options.clientFirstName.trim() || 'there';
  const coachLabel = options.coachName.trim() || 'Your coach';

  const text = [
    `Hi ${greeting},`,
    '',
    `${coachLabel} let you know your latest program results are ready to review.`,
    '',
    `Progress: ${options.links.progress}`,
    `Nutrition: ${options.links.nutrition}`,
    `Exercise: ${options.links.exercise}`,
    '',
    '— Master Metabolic'
  ].join('\n');

  const html = [
    `<p>Hi ${escapeHtml(greeting)},</p>`,
    `<p>${escapeHtml(coachLabel)} let you know your latest program results are ready to review.</p>`,
    '<ul>',
    `<li><a href="${escapeHtml(options.links.progress)}">View progress</a></li>`,
    `<li><a href="${escapeHtml(options.links.nutrition)}">View nutrition</a></li>`,
    `<li><a href="${escapeHtml(options.links.exercise)}">View exercise</a></li>`,
    '</ul>',
    '<p>— Master Metabolic</p>'
  ].join('');

  await sendOrThrow('Could not send email', () =>
    sendEmail({
      to: options.to,
      subject,
      text,
      html
    })
  );
}

export async function sendSessionRecapEmail(options: { to: string } & SessionRecapEmail) {
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured.');
  }

  await sendOrThrow('Could not send session recap email', () =>
    sendEmail({
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    })
  );
}

export async function sendCoachRequestNotificationEmail(options: {
  to: string;
  client: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  coachCode: string | null;
  adminUsersUrl: string;
}) {
  if (!isEmailConfigured()) {
    return;
  }

  const clientName = `${options.client.firstName} ${options.client.lastName}`.trim() || 'A new user';
  const subject = `Coach requested: ${clientName}`;
  const coachCodeLine = options.coachCode
    ? `Coach code entered: ${options.coachCode} (no matching coach found)`
    : 'No coach code entered.';

  const text = [
    'A user requested to work with a real coach during setup.',
    '',
    `Name: ${clientName}`,
    `Email: ${options.client.email}`,
    `Phone: ${options.client.phone ?? 'Not provided'}`,
    coachCodeLine,
    '',
    `Review in admin: ${options.adminUsersUrl}`,
    '',
    '— Master Metabolic'
  ].join('\n');

  const html = [
    '<p>A user requested to work with a real coach during setup.</p>',
    '<ul>',
    `<li><strong>Name:</strong> ${escapeHtml(clientName)}</li>`,
    `<li><strong>Email:</strong> ${escapeHtml(options.client.email)}</li>`,
    `<li><strong>Phone:</strong> ${escapeHtml(options.client.phone ?? 'Not provided')}</li>`,
    `<li><strong>Coach code:</strong> ${escapeHtml(options.coachCode ? `${options.coachCode} (no matching coach found)` : 'Not provided')}</li>`,
    '</ul>',
    `<p><a href="${escapeHtml(options.adminUsersUrl)}">Open admin users</a></p>`,
    '<p>— Master Metabolic</p>'
  ].join('');

  await sendOrThrow('Could not send coach request email', () =>
    sendEmail({
      to: options.to,
      subject,
      text,
      html
    })
  );
}

export async function sendStoreOrderNotificationEmail(options: {
  to: string;
  orderId: string;
  totalCents: number;
  customerName: string;
  customerEmail: string;
  shippingName: string | null;
  items: Array<{ name: string; quantity: number; priceCents: number }>;
}) {
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured.');
  }

  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const subject = `New store order — ${dollars(options.totalCents)} from ${options.customerName || options.customerEmail}`;

  const itemLines = options.items.map(
    (item) => `${item.quantity} × ${item.name} — ${dollars(item.priceCents * item.quantity)}`
  );
  const text = [
    `New paid store order ${options.orderId}.`,
    '',
    `Customer: ${options.customerName} (${options.customerEmail})`,
    options.shippingName ? `Ship to: ${options.shippingName} (address on the Stripe payment)` : null,
    '',
    ...itemLines,
    '',
    `Total: ${dollars(options.totalCents)}`,
    '',
    '— Master Metabolic'
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const html = [
    `<p>New paid store order <strong>${escapeHtml(options.orderId)}</strong>.</p>`,
    `<p>Customer: ${escapeHtml(options.customerName)} (${escapeHtml(options.customerEmail)})</p>`,
    options.shippingName ? `<p>Ship to: ${escapeHtml(options.shippingName)} (address on the Stripe payment)</p>` : '',
    '<ul>',
    ...options.items.map(
      (item) => `<li>${item.quantity} × ${escapeHtml(item.name)} — ${dollars(item.priceCents * item.quantity)}</li>`
    ),
    '</ul>',
    `<p><strong>Total: ${dollars(options.totalCents)}</strong></p>`,
    '<p>— Master Metabolic</p>'
  ].join('');

  await sendOrThrow('Could not send store order email', () =>
    sendEmail({
      to: options.to,
      subject,
      text,
      html
    })
  );
}

async function sendSimpleEmail(to: string, subject: string, lines: string[]) {
  if (!isEmailConfigured()) throw new Error('Email is not configured.');
  const text = lines.join('\n');
  const html = lines.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : '<br />')).join('');
  await sendOrThrow('Could not send email', () => sendEmail({ to, subject, text, html }));
}

/** Immediate alert to the team for a blocking / error-heavy feedback report. */
export async function sendFeedbackAlertEmail(options: {
  to: string;
  reference: string;
  reason: string;
  type: string;
  reporterName: string;
  screenLabel: string;
  detail: string;
}) {
  await sendSimpleEmail(options.to, `Feedback ${options.reference}: ${options.reason}`, [
    `${options.reference} — ${options.type} (${options.reason})`,
    `From: ${options.reporterName} · Screen: ${options.screenLabel}`,
    '',
    options.detail,
    '',
    'Open the Admin → Feedback queue to triage.'
  ]);
}

/** Notify the reporter that we need more info or their report is resolved. */
export async function sendFeedbackTesterEmail(options: {
  to: string;
  reference: string;
  reason: 'need_info' | 'resolved';
  message: string;
}) {
  const subject =
    options.reason === 'resolved'
      ? `Your feedback ${options.reference} is resolved`
      : `We need a bit more on your feedback ${options.reference}`;
  await sendSimpleEmail(options.to, subject, [
    `Thanks for your report ${options.reference}.`,
    '',
    options.message,
    '',
    '— The Metabolic team'
  ]);
}

/** Periodic digest of open feedback for the team. */
export async function sendFeedbackDigestEmail(options: { to: string; subject: string; lines: string[] }) {
  await sendSimpleEmail(options.to, options.subject, options.lines);
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
