import { prisma } from '../../db/prisma.js';
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_STATUS,
  RECIPIENT_STATUS,
  SKIP_REASONS,
  categoryAllowsUnsubscribe
} from './categories.js';
import { wrapEmailHtml, htmlToPlainText } from './htmlUtils.js';
import { inlineEmailImages } from './emailImageInliner.js';
import { sendCommunicationEmail } from './sendgridEmail.js';
import { getClientPublicUrl } from './storage.js';
import { generateToken } from './unsubscribeToken.js';
import { buildUnsubscribeMatcherForCategory } from './unsubscribeService.js';
import { normalizeRecipientInput } from './validation.js';
import { applyCommunicationVariables } from './variables.js';
import type {
  EligibilityEntry,
  EligibilitySummary,
  NormalizedRecipient,
  RecipientInput,
  RecipientRow
} from './types.js';

const ORGANIZATION_NAME = 'Metabolic OS';

function dedupeRecipients(recipients: RecipientInput[]): NormalizedRecipient[] {
  const seen = new Set<string>();
  const out: NormalizedRecipient[] = [];
  for (const raw of recipients || []) {
    const normalized = normalizeRecipientInput(raw);
    const key = normalized.email
      ? `email:${normalized.email}`
      : normalized.userId
        ? `user:${normalized.userId}`
        : normalized.phone
          ? `phone:${normalized.phone}`
          : null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

/** Strip CR/LF/control chars so merge values cannot inject email headers. */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ').trim();
}

export const evaluateEligibility = async (
  recipients: RecipientInput[],
  category: string,
  channel: string
): Promise<EligibilitySummary> => {
  const allowsUnsubscribe = categoryAllowsUnsubscribe(category);
  const channels =
    channel === COMMUNICATION_CHANNELS.BOTH
      ? [COMMUNICATION_CHANNELS.EMAIL, COMMUNICATION_CHANNELS.TEXT]
      : [channel];
  const isUnsubscribed = allowsUnsubscribe
    ? await buildUnsubscribeMatcherForCategory(category)
    : null;

  const summary: EligibilitySummary = {
    selected: 0,
    eligible: 0,
    unsubscribed: 0,
    missingEmail: 0,
    missingPhone: 0,
    smsNotOptedIn: 0,
    entries: []
  };

  for (const recipient of dedupeRecipients(recipients)) {
    for (const ch of channels) {
      summary.selected += 1;
      const entry: EligibilityEntry = {
        ...recipient,
        channel: ch,
        eligible: false,
        skipReason: null
      };

      if (ch === COMMUNICATION_CHANNELS.EMAIL) {
        if (!recipient.email) {
          entry.skipReason = SKIP_REASONS.MISSING_EMAIL;
          summary.missingEmail += 1;
        } else if (
          isUnsubscribed?.({
            userId: recipient.userId,
            email: recipient.email,
            phone: recipient.phone,
            channel: COMMUNICATION_CHANNELS.EMAIL
          })
        ) {
          entry.skipReason = SKIP_REASONS.UNSUBSCRIBED_EMAIL;
          summary.unsubscribed += 1;
        } else {
          entry.eligible = true;
          summary.eligible += 1;
        }
      } else if (!recipient.phone) {
        entry.skipReason = SKIP_REASONS.MISSING_PHONE;
        summary.missingPhone += 1;
      } else {
        entry.skipReason = SKIP_REASONS.SMS_NOT_OPTED_IN;
        summary.smsNotOptedIn += 1;
      }

      summary.entries.push(entry);
    }
  }

  return summary;
};

const buildUnsubscribeUrl = (
  target: { email?: string | null; phone?: string | null },
  category: string
): string => {
  try {
    const token = generateToken({ ...target, category });
    return `${getClientPublicUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
  } catch {
    return `${getClientPublicUrl()}/unsubscribe`;
  }
};

const buildVariableContext = ({
  entry,
  unsubscribeUrl
}: {
  entry: EligibilityEntry;
  unsubscribeUrl: string | null;
}): Record<string, unknown> => ({
  recipient_name: entry.displayName || 'there',
  recipient_email: entry.email || '',
  recipient_phone: entry.phone || '',
  unsubscribe_url: unsubscribeUrl || `${getClientPublicUrl()}/unsubscribe`,
  organization: ORGANIZATION_NAME,
  current_year: new Date().getFullYear()
});

const buildUnsubscribeFooterHtml = (email: string, category: string): string => {
  const url = buildUnsubscribeUrl({ email }, category);
  return `
<p style="font-size:12px;color:#666;margin-top:24px;border-top:1px solid #ddd;padding-top:16px;">
You are receiving this message from Metabolic OS. To stop receiving optional communications,
<a href="${url}" style="color:#059669;">unsubscribe here</a>.
</p>`;
};

const summarizeRecipientRows = (recipientRows: RecipientRow[]) => ({
  sent: recipientRows.filter((r) => r.status === RECIPIENT_STATUS.SENT).length,
  failed: recipientRows.filter((r) => r.status === RECIPIENT_STATUS.FAILED).length,
  skipped: recipientRows.filter((r) => r.status === RECIPIENT_STATUS.SKIPPED).length
});

const resolveFinalStatus = ({
  sentCount,
  failedCount,
  skippedCount
}: {
  sentCount: number;
  failedCount: number;
  skippedCount: number;
}): string => {
  if (sentCount === 0 && failedCount > 0) return COMMUNICATION_STATUS.FAILED;
  if (failedCount > 0 || skippedCount > 0) return COMMUNICATION_STATUS.PARTIAL;
  return COMMUNICATION_STATUS.SENT;
};

interface CommunicationRecord {
  id: string;
  subject: string | null;
  body: string;
  channel: string;
  category: string;
  status: string;
}

export const sendCommunication = async (
  communication: CommunicationRecord,
  recipients: RecipientInput[],
  userId: string
) => {
  const { id, subject, body, channel, category, status: previousStatus } = communication;
  const allowsUnsubscribe = categoryAllowsUnsubscribe(category);
  const uniqueRecipients = dedupeRecipients(recipients);
  const recipientRows: RecipientRow[] = [];
  let eligibility: EligibilitySummary | null = null;

  try {
    // Atomic draft → sending transition so concurrent sends cannot both proceed.
    if (previousStatus === COMMUNICATION_STATUS.DRAFT) {
      const claimed = await prisma.communication.updateMany({
        where: { id, status: COMMUNICATION_STATUS.DRAFT, deletedAt: null },
        data: { status: COMMUNICATION_STATUS.SENDING, updatedBy: userId }
      });
      if (claimed.count !== 1) {
        throw new Error('This communication is already being sent or is no longer a draft.');
      }
    } else {
      await prisma.communication.update({
        where: { id },
        data: { status: COMMUNICATION_STATUS.SENDING, updatedBy: userId }
      });
    }
    await prisma.communicationRecipient.deleteMany({ where: { communicationId: id } });

    eligibility = await evaluateEligibility(uniqueRecipients, category, channel);

    for (const entry of eligibility.entries) {
      if (!entry.eligible) {
        recipientRows.push({
          userId: entry.userId,
          displayName: entry.displayName,
          email: entry.email,
          phone: entry.phone,
          channel: entry.channel,
          status: RECIPIENT_STATUS.SKIPPED,
          skipReason: entry.skipReason
        });
      }
    }

    const emailEntries = eligibility.entries.filter(
      (e) => e.eligible && e.channel === COMMUNICATION_CHANNELS.EMAIL
    );

    if (emailEntries.length > 0) {
      const { html: inlinedBodyTemplate, attachments: inlineAttachments } =
        await inlineEmailImages(body);

      for (const entry of emailEntries) {
        const unsubscribeUrl = allowsUnsubscribe
          ? buildUnsubscribeUrl({ email: entry.email }, category)
          : null;
        const footer = allowsUnsubscribe
          ? buildUnsubscribeFooterHtml(entry.email as string, category)
          : '';
        const variableContext = buildVariableContext({ entry, unsubscribeUrl });
        const personalizedSubject = sanitizeHeaderValue(
          applyCommunicationVariables(subject || 'Message from Metabolic OS', variableContext)
        );
        const personalizedBody = applyCommunicationVariables(inlinedBodyTemplate, variableContext, {
          escape: true
        });
        const html = wrapEmailHtml(personalizedBody, footer);
        const text = htmlToPlainText(html);

        const result = await sendCommunicationEmail({
          to: entry.email as string,
          subject: personalizedSubject,
          html,
          text,
          attachments: inlineAttachments
        });

        recipientRows.push({
          userId: entry.userId,
          displayName: entry.displayName,
          email: entry.email,
          phone: entry.phone,
          channel: COMMUNICATION_CHANNELS.EMAIL,
          status: result.success ? RECIPIENT_STATUS.SENT : RECIPIENT_STATUS.FAILED,
          skipReason: null,
          errorMessage: result.success ? null : result.error || 'Email send failed',
          sentAt: result.success ? new Date() : null
        });
      }
    }

    if (recipientRows.length) {
      await prisma.communicationRecipient.createMany({
        data: recipientRows.map((row) => ({
          communicationId: id,
          userId: row.userId,
          displayName: row.displayName,
          email: row.email,
          phone: row.phone,
          channel: row.channel,
          status: row.status,
          skipReason: row.skipReason ?? null,
          errorMessage: row.errorMessage ?? null,
          sentAt: row.sentAt ?? null
        }))
      });
    }

    const { sent: sentCount, failed: failedCount, skipped: skippedCount } =
      summarizeRecipientRows(recipientRows);
    const finalStatus = resolveFinalStatus({ sentCount, failedCount, skippedCount });

    const updated = await prisma.communication.update({
      where: { id },
      data: {
        status: finalStatus,
        sentAt: new Date(),
        recipientsJson: uniqueRecipients as object[],
        updatedBy: userId
      },
      include: { recipients: true }
    });

    return {
      communication: updated,
      summary: {
        selected: eligibility.selected,
        eligible: eligibility.eligible,
        unsubscribed: eligibility.unsubscribed,
        missingEmail: eligibility.missingEmail,
        missingPhone: eligibility.missingPhone,
        smsNotOptedIn: eligibility.smsNotOptedIn,
        sent: sentCount,
        failed: failedCount,
        skipped: skippedCount
      },
      recipients: updated.recipients
    };
  } catch (error) {
    try {
      const { sent: sentCount, failed: failedCount, skipped: skippedCount } =
        summarizeRecipientRows(recipientRows);
      // Zero successful deliveries: restore to draft so the admin can retry.
      const status =
        sentCount === 0
          ? COMMUNICATION_STATUS.DRAFT
          : resolveFinalStatus({ sentCount, failedCount, skippedCount });
      await prisma.communicationRecipient.deleteMany({ where: { communicationId: id } });
      if (recipientRows.length) {
        await prisma.communicationRecipient.createMany({
          data: recipientRows.map((row) => ({
            communicationId: id,
            userId: row.userId,
            displayName: row.displayName,
            email: row.email,
            phone: row.phone,
            channel: row.channel,
            status: row.status,
            skipReason: row.skipReason ?? null,
            errorMessage: row.errorMessage ?? null,
            sentAt: row.sentAt ?? null
          }))
        });
      }
      await prisma.communication.update({
        where: { id },
        data: {
          status,
          sentAt: sentCount > 0 ? new Date() : null,
          recipientsJson: uniqueRecipients as object[],
          updatedBy: userId
        }
      });
    } catch {
      /* best-effort restore */
    }
    throw error;
  }
};

export type { NormalizedRecipient };
