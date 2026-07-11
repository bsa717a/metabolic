import sgMail from '@sendgrid/mail';
import { env } from '../config/env.js';
import type { ResultsReadyLinks } from './resultsReadyNotification.js';

export function isEmailConfigured() {
  return Boolean(env.SENDGRID_API_KEY && env.SENDGRID_FROM_EMAIL);
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

  sgMail.setApiKey(env.SENDGRID_API_KEY);

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

  try {
    await sgMail.send({
      to: options.to,
      from: {
        email: env.SENDGRID_FROM_EMAIL,
        name: env.SENDGRID_FROM_NAME
      },
      subject,
      text,
      html
    });
  } catch (error) {
    const detail =
      error && typeof error === 'object' && 'response' in error
        ? JSON.stringify((error as { response?: { body?: unknown } }).response?.body ?? error)
        : error instanceof Error
          ? error.message
          : 'Unknown SendGrid error';
    throw new Error(`Could not send email: ${detail.slice(0, 300)}`);
  }
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

  sgMail.setApiKey(env.SENDGRID_API_KEY);

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

  try {
    await sgMail.send({
      to: options.to,
      from: {
        email: env.SENDGRID_FROM_EMAIL,
        name: env.SENDGRID_FROM_NAME
      },
      subject,
      text,
      html
    });
  } catch (error) {
    const detail =
      error && typeof error === 'object' && 'response' in error
        ? JSON.stringify((error as { response?: { body?: unknown } }).response?.body ?? error)
        : error instanceof Error
          ? error.message
          : 'Unknown SendGrid error';
    throw new Error(`Could not send coach request email: ${detail.slice(0, 300)}`);
  }
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

  sgMail.setApiKey(env.SENDGRID_API_KEY);

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

  try {
    await sgMail.send({
      to: options.to,
      from: {
        email: env.SENDGRID_FROM_EMAIL,
        name: env.SENDGRID_FROM_NAME
      },
      subject,
      text,
      html
    });
  } catch (error) {
    const detail =
      error && typeof error === 'object' && 'response' in error
        ? JSON.stringify((error as { response?: { body?: unknown } }).response?.body ?? error)
        : error instanceof Error
          ? error.message
          : 'Unknown SendGrid error';
    throw new Error(`Could not send store order email: ${detail.slice(0, 300)}`);
  }
}

async function sendSimpleEmail(to: string, subject: string, lines: string[]) {
  if (!isEmailConfigured()) throw new Error('Email is not configured.');
  sgMail.setApiKey(env.SENDGRID_API_KEY);
  const text = lines.join('\n');
  const html = lines.map((line) => (line ? `<p>${escapeHtml(line)}</p>` : '<br />')).join('');
  try {
    await sgMail.send({
      to,
      from: { email: env.SENDGRID_FROM_EMAIL, name: env.SENDGRID_FROM_NAME },
      subject,
      text,
      html
    });
  } catch (error) {
    const detail =
      error && typeof error === 'object' && 'response' in error
        ? JSON.stringify((error as { response?: { body?: unknown } }).response?.body ?? error)
        : error instanceof Error
          ? error.message
          : 'Unknown SendGrid error';
    throw new Error(`Could not send email: ${detail.slice(0, 300)}`);
  }
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
