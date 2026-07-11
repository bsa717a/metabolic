import { FeedbackStatus, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import {
  isEmailConfigured,
  sendFeedbackAlertEmail,
  sendFeedbackDigestEmail,
  sendFeedbackTesterEmail
} from './emailService.js';
import { getFeedbackNotificationEmail, FEEDBACK_LAST_DIGEST_AT_KEY } from './appSettings.js';
import { referenceFor, getReport, FeedbackError } from './feedbackService.js';

const ERROR_ALERT_THRESHOLD = 3;
const DIAGNOSTICS_RETENTION_DAYS = 90;

async function notificationRecipient(): Promise<string | null> {
  return (await getFeedbackNotificationEmail(prisma)) ?? (env.STORE_NOTIFY_EMAIL || null) ?? null;
}

/**
 * Immediate alert for a just-submitted report — only when it's blocking or shows repeated
 * client errors. Fire-and-forget from the route; never throws.
 */
export async function notifyFeedbackSubmitted(reportId: string) {
  try {
    if (!isEmailConfigured()) return;
    const report = await prisma.feedbackReport.findUnique({ where: { id: reportId } });
    if (!report) return;

    const errors = Array.isArray((report.diagnostics as { clientErrors?: unknown[] } | null)?.clientErrors)
      ? ((report.diagnostics as { clientErrors: unknown[] }).clientErrors.length)
      : 0;
    const reason = report.blocking ? 'blocking report' : errors >= ERROR_ALERT_THRESHOLD ? 'repeated errors' : null;
    if (!reason) return;

    const to = await notificationRecipient();
    if (!to) return;

    await sendFeedbackAlertEmail({
      to,
      reference: referenceFor(report.seq),
      reason,
      type: report.type,
      reporterName: report.reporterName,
      screenLabel: report.screenLabel ?? report.route,
      detail: report.detail || report.goal
    });
  } catch (error) {
    console.error('Feedback submit notification failed', error);
  }
}

/** Notify the reporter (need-info / resolved) and log the event. */
export async function notifyTester(actorId: string, reportId: string, reason: 'need_info' | 'resolved', message: string) {
  const report = await prisma.feedbackReport.findUnique({ where: { id: reportId } });
  if (!report) throw new FeedbackError('Report not found.');
  if (!report.reporterEmail) throw new FeedbackError('This report has no reporter email.');
  if (!isEmailConfigured()) throw new FeedbackError('Email is not configured.');

  await sendFeedbackTesterEmail({ to: report.reporterEmail, reference: referenceFor(report.seq), reason, message });
  await prisma.feedbackEvent.create({
    data: { reportId, actorId, kind: 'tester_notified', detail: { reason } }
  });
  return getReport(reportId);
}

/**
 * Periodic digest of open reports since the last run, plus retention purge of old
 * diagnostics. Idempotent-ish: advances feedback_last_digest_at so each report is
 * summarized once.
 */
export async function runFeedbackDigestTick() {
  const lastSetting = await prisma.appSetting.findUnique({ where: { key: FEEDBACK_LAST_DIGEST_AT_KEY } });
  const since = lastSetting?.value ? new Date(lastSetting.value) : null;
  const now = new Date();

  const openStatuses = [FeedbackStatus.NEW, FeedbackStatus.REVIEWING, FeedbackStatus.PLANNED];
  const reportSelect = {
    seq: true,
    type: true,
    blocking: true,
    goal: true,
    detail: true,
    screenLabel: true,
    route: true,
    createdAt: true
  } as const;
  type DigestReport = Awaited<ReturnType<typeof prisma.feedbackReport.findMany<{ select: typeof reportSelect }>>>[number];
  const batches: DigestReport[][] = [];
  let cursor = since;
  while (true) {
    const batch = await prisma.feedbackReport.findMany({
      where: { status: { in: openStatuses }, createdAt: cursor ? { gt: cursor } : undefined },
      orderBy: { createdAt: 'asc' },
      take: 50,
      select: reportSelect
    });
    if (batch.length === 0) break;
    batches.push(batch);
    cursor = batch[batch.length - 1]!.createdAt;
    if (batch.length < 50) break;
  }
  const newReports = batches.flat();
  const totalOpen = await prisma.feedbackReport.count({ where: { status: { in: openStatuses } } });

  let emailed = false;
  const to = await notificationRecipient();
  if (to && isEmailConfigured() && newReports.length > 0) {
    for (const batch of batches) {
      const lines = [
        `${batch.length} new report(s) since the last digest · ${totalOpen} open total.`,
        '',
        ...batch.map((r) => {
          const desc = (r.detail || r.goal).replace(/\s+/g, ' ').slice(0, 90);
          return `${referenceFor(r.seq)} [${r.type}${r.blocking ? ', blocking' : ''}] ${r.screenLabel ?? r.route} — ${desc}`;
        }),
        '',
        'Open Admin → Feedback to triage.'
      ];
      await sendFeedbackDigestEmail({ to, subject: `Feedback digest — ${batch.length} new`, lines });
    }
    emailed = true;
    await prisma.appSetting.upsert({
      where: { key: FEEDBACK_LAST_DIGEST_AT_KEY },
      create: { key: FEEDBACK_LAST_DIGEST_AT_KEY, value: now.toISOString() },
      update: { value: now.toISOString() }
    });
  }

  // Retention: purge diagnostics older than the window.
  const cutoff = new Date(now.getTime() - DIAGNOSTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const purged = await prisma.feedbackReport.updateMany({
    where: { createdAt: { lt: cutoff }, diagnostics: { not: Prisma.JsonNull }, diagnosticsPurgedAt: null },
    data: { diagnostics: Prisma.JsonNull, diagnosticsPurgedAt: now }
  });

  return { newReports: newReports.length, totalOpen, emailed, purgedDiagnostics: purged.count };
}
