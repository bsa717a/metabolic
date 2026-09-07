import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { isEmailConfigured, sendEmail } from './emailTransport.js';
import { sendPushToUser } from './pushNotificationService.js';

export type NewClientInfo = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

export type NotifyCoachNewClientResult = {
  pushSent: number;
  emailSent: boolean;
  emailTo: string | null;
  skipped?: 'already_linked';
};

/**
 * Check if the client was already linked to this coach before (i.e., re-assignment).
 * We only want to notify on the first successful link, not on re-visits or re-links.
 */
async function wasAlreadyLinked(coachId: string, clientId: string): Promise<boolean> {
  const assignment = await prisma.coachAssignment.findUnique({
    where: { coachId_userId: { coachId, userId: clientId } }
  });
  return Boolean(assignment);
}

/**
 * Notify the coach that a new client has linked to them.
 * Uses both push notifications (in-app) and email (if configured).
 *
 * This is called AFTER the coach-client link is successfully created,
 * specifically from the confirm-coach-invite endpoint.
 *
 * @param coachId - The coach's user ID
 * @param client - The newly linked client's info
 * @param options.checkAlreadyLinked - If true, skip if already linked (default: true)
 */
export async function notifyCoachNewClient(
  coachId: string,
  client: NewClientInfo,
  options?: { checkAlreadyLinked?: boolean }
): Promise<NotifyCoachNewClientResult> {
  const checkAlreadyLinked = options?.checkAlreadyLinked !== false;

  if (checkAlreadyLinked) {
    const alreadyLinked = await wasAlreadyLinked(coachId, client.id);
    if (alreadyLinked) {
      return { pushSent: 0, emailSent: false, emailTo: null, skipped: 'already_linked' };
    }
  }

  const coach = await prisma.user.findUnique({
    where: { id: coachId },
    select: { email: true, firstName: true }
  });

  if (!coach) {
    return { pushSent: 0, emailSent: false, emailTo: null };
  }

  const clientName = `${client.firstName} ${client.lastName}`.trim() || client.email;
  const clientsUrl = `${env.CLIENT_URL}/coach`;

  const pushSent = await sendPushToUser(coachId, {
    title: 'New client connected',
    body: `${clientName} just linked to you via your invite code.`,
    url: '/coach'
  });

  let emailSent = false;
  if (isEmailConfigured()) {
    try {
      await sendNewClientEmail({
        to: coach.email,
        coachFirstName: coach.firstName,
        clientName,
        clientEmail: client.email,
        clientsUrl
      });
      emailSent = true;
    } catch {
      // Email send failure is non-fatal
    }
  }

  return { pushSent, emailSent, emailTo: emailSent ? coach.email : null };
}

async function sendNewClientEmail(options: {
  to: string;
  coachFirstName: string;
  clientName: string;
  clientEmail: string;
  clientsUrl: string;
}) {
  const greeting = options.coachFirstName?.trim() ? `Hi ${options.coachFirstName},` : 'Hi,';

  const subject = `New client: ${options.clientName}`;

  const text = [
    greeting,
    '',
    `${options.clientName} (${options.clientEmail}) just connected to you using your invite link.`,
    '',
    "They're now visible on your coaching dashboard and ready to start their program.",
    '',
    `View your clients: ${options.clientsUrl}`,
    '',
    '— Metabolic OS'
  ].join('\n');

  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p><strong>${escapeHtml(options.clientName)}</strong> (${escapeHtml(options.clientEmail)}) just connected to you using your invite link.</p>`,
    "<p>They're now visible on your coaching dashboard and ready to start their program.</p>",
    `<p><a href="${escapeHtml(options.clientsUrl)}">View your clients →</a></p>`,
    '<p>— Metabolic OS</p>'
  ].join('');

  await sendEmail({
    to: options.to,
    subject,
    text,
    html
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
