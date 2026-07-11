import {
  FeedbackSeverity,
  FeedbackStatus,
  FeedbackType,
  PlanTier,
  Role,
  type Prisma
} from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { planToSlug } from './entitlements.js';

export class FeedbackError extends Error {}

export function referenceFor(seq: number) {
  return `FB-${seq}`;
}

/** Composite account-type label: role wins over plan. */
export function deriveAccountType(role: Role, plan: PlanTier): string {
  if (role === Role.SUPER_ADMIN || role === Role.ADMIN) return 'administrator';
  if (role === Role.COACH) return 'coach';
  return planToSlug(plan); // self_guided | plus | coach_led | starter
}

// --- Diagnostics whitelist (defense in depth; the client already whitelists) ---

const MAX_ARRAY = 20;

function str(value: unknown, max = 500): string | null {
  return typeof value === 'string' && value.trim() ? value.slice(0, max) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizeNavTrail(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-MAX_ARRAY)
    .map((entry) => {
      const e = entry as Record<string, unknown>;
      const pathname = str(e?.pathname, 200);
      return pathname ? { pathname, at: str(e?.at, 40) } : null;
    })
    .filter(Boolean);
}

function sanitizeErrors(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-MAX_ARRAY)
    .map((entry) => {
      const e = entry as Record<string, unknown>;
      const message = str(e?.message, 500);
      return message ? { message, source: str(e?.source, 300), at: str(e?.at, 40) } : null;
    })
    .filter(Boolean);
}

function sanitizeFailedRequests(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-MAX_ARRAY)
    .map((entry) => {
      const e = entry as Record<string, unknown>;
      const path = str(e?.path, 200);
      const status = num(e?.status);
      // Never keep query strings — strip anything after '?'.
      return path && status !== null
        ? { method: str(e?.method, 10) ?? 'GET', path: path.split('?')[0], status, at: str(e?.at, 40) }
        : null;
    })
    .filter(Boolean);
}

/**
 * Returns a whitelisted copy of the client diagnostics. Any key not explicitly copied
 * here is dropped — so a client bug or tampering can never persist bodies, tokens, or
 * health data.
 */
export function sanitizeDiagnostics(raw: unknown): Prisma.JsonObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const screen = d.screen as Record<string, unknown> | undefined;
  const viewport = d.viewport as Record<string, unknown> | undefined;
  const selected = d.selectedRecord as Record<string, unknown> | undefined;

  const flags = Array.isArray(d.featureFlags)
    ? d.featureFlags.filter((f): f is string => typeof f === 'string').slice(0, 60)
    : [];

  const selectedRecord =
    selected && str(selected.type, 40) && str(selected.id, 100)
      ? { type: str(selected.type, 40)!, id: str(selected.id, 100)!, label: str(selected.label, 120) }
      : null;

  return {
    browser: str(d.browser, 40) ?? 'Unknown',
    os: str(d.os, 40) ?? 'Unknown',
    deviceType: str(d.deviceType, 20) ?? 'Unknown',
    screen: { width: num(screen?.width) ?? 0, height: num(screen?.height) ?? 0 },
    viewport: { width: num(viewport?.width) ?? 0, height: num(viewport?.height) ?? 0 },
    timezone: str(d.timezone, 60) ?? '',
    appVersion: str(d.appVersion, 60) ?? '',
    featureFlags: flags,
    navTrail: sanitizeNavTrail(d.navTrail),
    clientErrors: sanitizeErrors(d.clientErrors),
    failedRequests: sanitizeFailedRequests(d.failedRequests),
    selectedRecord
  } as Prisma.JsonObject;
}

export type CreateFeedbackInput = {
  type: FeedbackType;
  goal: string;
  detail: string;
  blocking: boolean;
  route: string;
  screenLabel?: string | null;
  diagnostics?: unknown;
};

export async function createReport(
  actor: { id: string; email: string; firstName: string; lastName: string; role: Role; plan: PlanTier },
  input: CreateFeedbackInput
) {
  const goal = input.goal.trim();
  const detail = input.detail.trim();
  if (!goal && !detail) throw new FeedbackError('Please describe what happened.');

  const diagnostics = sanitizeDiagnostics(input.diagnostics);
  const appVersion = typeof diagnostics?.appVersion === 'string' ? diagnostics.appVersion : null;

  const report = await prisma.feedbackReport.create({
    data: {
      type: input.type,
      blocking: input.blocking,
      goal: goal.slice(0, 4000),
      detail: detail.slice(0, 4000),
      userId: actor.id,
      reporterEmail: actor.email,
      reporterName: `${actor.firstName} ${actor.lastName}`.trim(),
      accountType: deriveAccountType(actor.role, actor.plan),
      route: input.route.slice(0, 300),
      screenLabel: input.screenLabel?.trim()?.slice(0, 120) || null,
      appVersion,
      diagnostics: diagnostics ?? undefined,
      events: { create: { actorId: actor.id, kind: 'created' } }
    }
  });

  return { id: report.id, reference: referenceFor(report.seq) };
}

// --- Admin: serializers (whitelist only — never firebaseUid or health data) ---

const ROW_SELECT = {
  id: true,
  seq: true,
  type: true,
  status: true,
  blocking: true,
  severity: true,
  goal: true,
  detail: true,
  reporterName: true,
  reporterEmail: true,
  accountType: true,
  route: true,
  screenLabel: true,
  appVersion: true,
  createdAt: true,
  diagnostics: true,
  diagnosticsPurgedAt: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true } }
} satisfies Prisma.FeedbackReportSelect;

function shortDescription(goal: string, detail: string) {
  const text = (detail || goal).replace(/\s+/g, ' ').trim();
  return text.length > 100 ? `${text.slice(0, 100)}…` : text;
}

type RowPayload = Prisma.FeedbackReportGetPayload<{ select: typeof ROW_SELECT }>;

function serializeRow(r: RowPayload) {
  return {
    id: r.id,
    reference: referenceFor(r.seq),
    type: r.type,
    status: r.status,
    blocking: r.blocking,
    severity: r.severity,
    shortDescription: shortDescription(r.goal, r.detail),
    reporterName: r.reporterName,
    reporterEmail: r.reporterEmail,
    accountType: r.accountType,
    route: r.route,
    screenLabel: r.screenLabel,
    appVersion: r.appVersion,
    createdAt: r.createdAt.toISOString(),
    assignedTo: r.assignedTo
      ? { id: r.assignedTo.id, name: `${r.assignedTo.firstName} ${r.assignedTo.lastName}`.trim() }
      : null,
    hasDiagnostics: Boolean(r.diagnostics) && !r.diagnosticsPurgedAt
  };
}

export type FeedbackListFilters = {
  status?: FeedbackStatus;
  type?: FeedbackType;
  blocking?: boolean;
  assignedToId?: string;
  appVersion?: string;
  search?: string;
  from?: Date;
  to?: Date;
};

export async function listReports(filters: FeedbackListFilters, options: { page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50));
  const where: Prisma.FeedbackReportWhereInput = {
    status: filters.status,
    type: filters.type,
    blocking: filters.blocking,
    assignedToId: filters.assignedToId,
    appVersion: filters.appVersion,
    createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
    ...(filters.search
      ? {
          OR: [
            { goal: { contains: filters.search, mode: 'insensitive' } },
            { detail: { contains: filters.search, mode: 'insensitive' } },
            { reporterName: { contains: filters.search, mode: 'insensitive' } },
            { reporterEmail: { contains: filters.search, mode: 'insensitive' } }
          ]
        }
      : {})
  };

  const [total, rows] = await prisma.$transaction([
    prisma.feedbackReport.count({ where }),
    prisma.feedbackReport.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: ROW_SELECT
    })
  ]);

  return { reports: rows.map(serializeRow), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getReport(id: string) {
  const report = await prisma.feedbackReport.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      duplicateOf: { select: { id: true, seq: true } },
      duplicates: { select: { id: true, seq: true } },
      notes: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, body: true, createdAt: true, author: { select: { firstName: true, lastName: true } } }
      },
      events: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, kind: true, detail: true, createdAt: true, actor: { select: { firstName: true, lastName: true } } }
      }
    }
  });
  if (!report) throw new FeedbackError('Report not found.');

  return {
    ...serializeRow(report),
    goal: report.goal,
    detail: report.detail,
    resolutionNote: report.resolutionNote,
    externalRef: report.externalRef,
    userId: report.userId,
    diagnostics: report.diagnosticsPurgedAt ? null : report.diagnostics,
    diagnosticsPurgedAt: report.diagnosticsPurgedAt?.toISOString() ?? null,
    duplicateOf: report.duplicateOf ? { id: report.duplicateOf.id, reference: referenceFor(report.duplicateOf.seq) } : null,
    duplicates: report.duplicates.map((d) => ({ id: d.id, reference: referenceFor(d.seq) })),
    notes: report.notes.map((n) => ({
      id: n.id,
      body: n.body,
      author: n.author ? `${n.author.firstName} ${n.author.lastName}`.trim() : null,
      createdAt: n.createdAt.toISOString()
    })),
    events: report.events.map((e) => ({
      id: e.id,
      kind: e.kind,
      detail: e.detail,
      actor: e.actor ? `${e.actor.firstName} ${e.actor.lastName}`.trim() : null,
      createdAt: e.createdAt.toISOString()
    }))
  };
}

export type FeedbackUpdateInput = {
  status?: FeedbackStatus;
  severity?: FeedbackSeverity | null;
  assignedToId?: string | null;
  duplicateOfId?: string | null;
  resolutionNote?: string | null;
  externalRef?: string | null;
};

export async function updateReport(actorId: string, id: string, input: FeedbackUpdateInput) {
  const existing = await prisma.feedbackReport.findUnique({ where: { id } });
  if (!existing) throw new FeedbackError('Report not found.');
  if (input.duplicateOfId && input.duplicateOfId === id) {
    throw new FeedbackError('A report cannot be a duplicate of itself.');
  }

  const events: Prisma.FeedbackEventCreateManyInput[] = [];
  if (input.status && input.status !== existing.status) {
    events.push({ reportId: id, actorId, kind: 'status_changed', detail: { from: existing.status, to: input.status } });
  }
  if (input.severity !== undefined && input.severity !== existing.severity) {
    events.push({ reportId: id, actorId, kind: 'severity_changed', detail: { from: existing.severity, to: input.severity } });
  }
  if (input.assignedToId !== undefined && input.assignedToId !== existing.assignedToId) {
    events.push({ reportId: id, actorId, kind: 'assigned', detail: { to: input.assignedToId } });
  }
  if (input.duplicateOfId !== undefined && input.duplicateOfId !== existing.duplicateOfId) {
    events.push({ reportId: id, actorId, kind: 'duplicate_linked', detail: { to: input.duplicateOfId } });
  }

  // When linking a duplicate, default the status to DUPLICATE unless the caller set one.
  const status = input.duplicateOfId && !input.status ? FeedbackStatus.DUPLICATE : input.status;

  await prisma.$transaction(async (tx) => {
    await tx.feedbackReport.update({
      where: { id },
      data: {
        status,
        severity: input.severity,
        assignedToId: input.assignedToId,
        duplicateOfId: input.duplicateOfId,
        resolutionNote: input.resolutionNote,
        externalRef: input.externalRef
      }
    });
    if (events.length) await tx.feedbackEvent.createMany({ data: events });
  });

  return getReport(id);
}

export async function addNote(actorId: string, id: string, body: string) {
  const text = body.trim();
  if (!text) throw new FeedbackError('Note cannot be empty.');
  const report = await prisma.feedbackReport.findUnique({ where: { id }, select: { id: true } });
  if (!report) throw new FeedbackError('Report not found.');
  await prisma.$transaction([
    prisma.feedbackNote.create({ data: { reportId: id, authorId: actorId, body: text.slice(0, 4000) } }),
    prisma.feedbackEvent.create({ data: { reportId: id, actorId, kind: 'note_added' } })
  ]);
  return getReport(id);
}

/** Likely duplicates: same screen + type, recent, excluding this report and already-closed ones. */
export async function findSimilar(id: string) {
  const report = await prisma.feedbackReport.findUnique({ where: { id } });
  if (!report) return [];
  const rows = await prisma.feedbackReport.findMany({
    where: {
      id: { not: id },
      route: report.route,
      type: report.type,
      status: { notIn: [FeedbackStatus.CLOSED, FeedbackStatus.DUPLICATE] }
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: ROW_SELECT
  });
  return rows.map(serializeRow);
}
