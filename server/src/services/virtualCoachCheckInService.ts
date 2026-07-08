import { ProgramStatus, type VirtualCoachCheckInKind, type VirtualCoachCheckInStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { isVirtualCoachId, type VirtualCoachId } from '../data/virtualCoachPersonas.js';
import { addUtcDays, parseDateParam, toDateKey, userDayKey } from '../utils/dates.js';
import { getAiProvider } from './aiService.js';
import { buildCoachCheckInSystemPrompt } from './coachPersona.js';
import { getWeeklyReview, startOfWeekMonday } from './weeklyReviewService.js';
import { advancePlanForCheckIn } from './planAdvancement.js';
import { n } from '../utils/numbers.js';
import {
  buildMemoryPromptSection,
  getVirtualCoachMemoryView,
  scheduleMemoryExtraction,
  transcriptToMemoryMessages
} from './virtualCoachMemoryService.js';

export const CHECK_IN_STAGES = [
  'opening',
  'wins',
  'obstacles',
  'data_reflection',
  'pattern',
  'focus',
  'commitment',
  'recap'
] as const;

/** The first-ever check-in is a kickoff conversation, not a review. */
export const KICKOFF_STAGES = [
  'welcome',
  'why',
  'goals',
  'rhythm',
  'first_focus',
  'commitment',
  'recap'
] as const;

export type CheckInStage = (typeof CHECK_IN_STAGES)[number] | (typeof KICKOFF_STAGES)[number];

export function stagesForKind(kind: VirtualCoachCheckInKind): readonly CheckInStage[] {
  return kind === 'KICKOFF' ? KICKOFF_STAGES : CHECK_IN_STAGES;
}

export type TranscriptMessage = {
  role: 'coach' | 'user';
  content: string;
  at: string;
};

export type CheckInTranscript = {
  currentStage: CheckInStage;
  messages: TranscriptMessage[];
  chips?: string[];
  /** Kickoff only: the user's verbatim answer at the "why" stage. */
  whyAnswer?: string;
};

export type CheckInRecapFields = {
  kind?: VirtualCoachCheckInKind;
  feelingNote?: string | null;
  win?: string | null;
  pattern?: string | null;
  focus?: string | null;
  supportAction?: string | null;
  nextCheckInDate?: string | null;
  completedAt?: string | null;
};

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

function localDayOfWeek(timeZone: string | null | undefined, date = new Date()) {
  const label = new Intl.DateTimeFormat('en-US', { timeZone: timeZone ?? 'UTC', weekday: 'short' }).format(date);
  return WEEKDAY_SHORT[label] ?? 0;
}

function deterministicCheckInDay(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return hash % 7;
}

export function parseTranscript(value: unknown, kind: VirtualCoachCheckInKind = 'WEEKLY'): CheckInTranscript {
  const raw = value as Partial<CheckInTranscript> | null;
  const stages = stagesForKind(kind);
  const stage = raw?.currentStage;
  const currentStage = stages.includes(stage as CheckInStage) ? (stage as CheckInStage) : stages[0];
  const messages = Array.isArray(raw?.messages)
    ? raw.messages.filter(
        (entry): entry is TranscriptMessage =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          (entry as TranscriptMessage).role !== undefined &&
          typeof (entry as TranscriptMessage).content === 'string'
      )
    : [];
  const chips = Array.isArray(raw?.chips)
    ? raw.chips.filter((chip): chip is string => typeof chip === 'string' && chip.trim().length > 0)
    : undefined;
  const whyAnswer = typeof raw?.whyAnswer === 'string' && raw.whyAnswer.trim() ? raw.whyAnswer : undefined;
  return { currentStage, messages, chips, whyAnswer };
}

function emptyTranscript(kind: VirtualCoachCheckInKind): CheckInTranscript {
  return { currentStage: stagesForKind(kind)[0], messages: [] };
}

export function nextStage(stage: CheckInStage, kind: VirtualCoachCheckInKind = 'WEEKLY'): CheckInStage {
  const stages = stagesForKind(kind);
  const index = stages.indexOf(stage);
  return stages[Math.min(index + 1, stages.length - 1)];
}

function nextCheckInDateKey(checkInDay: number, timeZone: string | null | undefined, from = new Date()) {
  const todayDow = localDayOfWeek(timeZone, from);
  let daysUntil = (checkInDay - todayDow + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  const todayKey = userDayKey(timeZone, from);
  return toDateKey(addUtcDays(parseDateParam(todayKey), daysUntil));
}

function serializeRecap(record: {
  kind?: VirtualCoachCheckInKind;
  feelingNote: string | null;
  win: string | null;
  pattern: string | null;
  focus: string | null;
  supportAction: string | null;
  nextCheckInDate: Date | null;
  completedAt: Date | null;
}): CheckInRecapFields {
  return {
    kind: record.kind,
    feelingNote: record.feelingNote,
    win: record.win,
    pattern: record.pattern,
    focus: record.focus,
    supportAction: record.supportAction,
    nextCheckInDate: record.nextCheckInDate ? toDateKey(record.nextCheckInDate) : null,
    completedAt: record.completedAt?.toISOString() ?? null
  };
}

function serializeSession(record: {
  id: string;
  coachId: string;
  kind: VirtualCoachCheckInKind;
  weekStart: Date;
  status: VirtualCoachCheckInStatus;
  transcript: unknown;
  feelingNote: string | null;
  win: string | null;
  pattern: string | null;
  focus: string | null;
  supportAction: string | null;
  nextCheckInDate: Date | null;
  createdAt: Date;
  completedAt: Date | null;
}) {
  const transcript = parseTranscript(record.transcript, record.kind);
  return {
    id: record.id,
    coachId: record.coachId,
    kind: record.kind,
    weekStart: toDateKey(record.weekStart),
    status: record.status,
    currentStage: transcript.currentStage,
    transcript: transcript.messages,
    recap: serializeRecap(record),
    createdAt: record.createdAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    chips: transcript.chips ?? []
  };
}

async function ensureCheckInDay(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      virtualCoachCheckInDay: true,
      selectedVirtualCoachId: true,
      firstName: true,
      timezone: true
    }
  });
  if (!user) throw new Error('User not found');

  let checkInDay = user.virtualCoachCheckInDay;
  if (checkInDay == null) {
    checkInDay = deterministicCheckInDay(userId);
    await prisma.user.update({
      where: { id: userId },
      data: { virtualCoachCheckInDay: checkInDay }
    });
  }

  return { ...user, virtualCoachCheckInDay: checkInDay };
}

/** Drop in-progress check-ins tied to a coach the user no longer has selected. */
async function discardStaleInProgressSessions(userId: string, selectedCoachId: string | null) {
  if (!selectedCoachId) return;
  await prisma.virtualCoachCheckIn.deleteMany({
    where: { userId, status: 'IN_PROGRESS', coachId: { not: selectedCoachId } }
  });
}

export async function getCheckInState(userId: string) {
  const user = await ensureCheckInDay(userId);
  await discardStaleInProgressSessions(userId, user.selectedVirtualCoachId);
  const timeZone = user.timezone;
  const todayKey = userDayKey(timeZone);
  const weekStart = startOfWeekMonday(todayKey);
  const checkInDay = user.virtualCoachCheckInDay!;
  const isCheckInDay = localDayOfWeek(timeZone) === checkInDay;
  const nextDate = nextCheckInDateKey(checkInDay, timeZone);

  const [inProgress, completedThisWeek, latestCompleted] = await Promise.all([
    prisma.virtualCoachCheckIn.findFirst({
      where: { userId, weekStart: parseDateParam(weekStart), status: 'IN_PROGRESS' },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.virtualCoachCheckIn.findFirst({
      where: { userId, weekStart: parseDateParam(weekStart), status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' }
    }),
    prisma.virtualCoachCheckIn.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' }
    })
  ]);

  const latestRecap = completedThisWeek ?? latestCompleted;
  // A check-in can always be started (or redone) as long as a coach is selected.
  // The assigned day and weekly cadence are gentle nudges, never a hard lock.
  const canStart = Boolean(user.selectedVirtualCoachId);

  return {
    coachId: user.selectedVirtualCoachId,
    checkInDay,
    checkInDayLabel: WEEKDAY_LABELS[checkInDay],
    isCheckInDay,
    nextCheckInDate: isCheckInDay && !completedThisWeek ? todayKey : nextDate,
    canStart,
    inProgressSession: inProgress ? serializeSession(inProgress) : null,
    latestRecap: latestRecap ? serializeRecap(latestRecap) : null,
    weekStart
  };
}

/** Discards an in-progress check-in so the user can start a fresh one (e.g. after a refresh). */
export async function discardCheckIn(userId: string, sessionId: string) {
  await prisma.virtualCoachCheckIn.deleteMany({
    where: { id: sessionId, userId, status: 'IN_PROGRESS' }
  });
  return getCheckInState(userId);
}

export async function setCheckInDay(userId: string, day: number) {
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    throw new Error('Choose a valid day of the week.');
  }
  await prisma.user.update({
    where: { id: userId },
    data: { virtualCoachCheckInDay: day }
  });
  return getCheckInState(userId);
}

function messageIncludesName(message: string, firstName: string) {
  const escaped = firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(message);
}

function stripCoachName(message: string, firstName: string): string {
  const escaped = firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = message;
  out = out.replace(new RegExp(`\\b(hey|hi|hello|okay|ok|alright|well|so|oh)\\s+${escaped}\\b`, 'gi'), '$1');
  out = out.replace(new RegExp(`\\s*,\\s*${escaped}\\b(?!['’]s)`, 'gi'), '');
  out = out.replace(new RegExp(`\\b${escaped}\\b(?!['’]s)\\s*,\\s*`, 'gi'), '');
  out = out.replace(new RegExp(`\\b${escaped}\\b(?!['’]s)[!.]?`, 'gi'), '');
  out = out
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/^[\s,]+/, '')
    .trim();
  if (out) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out || message;
}

function ensureCoachUsesName(message: string, firstName: string, isOpening: boolean): string {
  if (messageIncludesName(message, firstName)) return message;
  const trimmed = message.trim();
  if (isOpening) {
    return `Hi ${firstName}. ${trimmed}`;
  }
  return `${firstName}, ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

/** Opening line always uses their name; every other coach message alternates name on/off. Recap sign-off always keeps it. */
export function applyCoachNameUsage(
  message: string,
  firstName?: string | null,
  coachMessageNumber = 1,
  isRecapClosing = false
): string {
  const name = firstName?.trim();
  if (!message || !name) return message;

  const keepName = isRecapClosing || coachMessageNumber % 2 === 1;
  if (keepName) {
    return ensureCoachUsesName(message, name, coachMessageNumber === 1);
  }
  return stripCoachName(message, name);
}

const GOAL_METRIC_LABELS: Record<string, string> = {
  WEIGHT: 'Weight',
  BODY_FAT: 'Body fat',
  WAIST: 'Waist',
  LEAN_TISSUE_MASS: 'Lean tissue',
  FAT_MASS: 'Fat mass'
};

/** "Weight: 210 → goal 185 lbs" lines for the kickoff goals stage. */
async function kickoffGoalLines(userId: string): Promise<string[]> {
  const program = await prisma.program.findFirst({
    where: { userId, status: ProgramStatus.ACTIVE },
    include: { metrics: true }
  });
  if (!program) return [];
  return program.metrics
    .filter((metric) => GOAL_METRIC_LABELS[metric.metricType] && metric.goalValue != null)
    .map((metric) => {
      const label = GOAL_METRIC_LABELS[metric.metricType];
      const unit = metric.unit ? ` ${metric.unit}` : '';
      return `${label}: ${n(metric.currentValue)} → goal ${n(metric.goalValue)}${unit}`;
    });
}

async function runCoachTurn(
  userId: string,
  coachId: VirtualCoachId,
  stage: CheckInStage,
  transcript: CheckInTranscript,
  userMessage?: string,
  kind: VirtualCoachCheckInKind = 'WEEKLY'
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, timezone: true, clientProfile: { select: { motivation: true } } }
  });
  if (!user) throw new Error('User not found');

  const flow = kind === 'KICKOFF' ? ('kickoff' as const) : ('weekly' as const);
  const weeklyReview = await getWeeklyReview(userId, user.timezone);
  const memoryView = await getVirtualCoachMemoryView(userId);
  const memorySection = buildMemoryPromptSection(memoryView);
  const systemPrompt = [
    buildCoachCheckInSystemPrompt(coachId, user.firstName, {
      flow,
      motivation: user.clientProfile?.motivation ?? null
    }),
    memorySection
  ]
    .filter(Boolean)
    .join('\n\n');
  const kickoffContext = flow === 'kickoff' ? { goalLines: await kickoffGoalLines(userId) } : undefined;

  const coachMessageNumber = transcript.messages.filter((entry) => entry.role === 'coach').length + 1;

  const turn = await getAiProvider().coachCheckInTurn({
    coachId,
    stage,
    flow,
    systemPrompt,
    weeklyReview,
    kickoffContext,
    transcript: transcript.messages,
    userMessage,
    userFirstName: user.firstName,
    coachMessageNumber
  });

  return { ...turn, message: applyCoachNameUsage(turn.message, user.firstName, coachMessageNumber, stage === 'recap') };
}

/** Persisting the kickoff "why" must never fail the check-in itself. */
async function persistMotivationSafely(userId: string, motivation: string | null | undefined) {
  const trimmed = motivation?.trim();
  if (!trimmed) return;
  try {
    await prisma.clientProfile.upsert({
      where: { userId },
      create: { userId, motivation: trimmed.slice(0, 500) },
      update: { motivation: trimmed.slice(0, 500) }
    });
  } catch (error) {
    console.error('Failed to persist kickoff motivation', error);
  }
}

export async function startCheckIn(userId: string) {
  const user = await ensureCheckInDay(userId);
  if (!user.selectedVirtualCoachId || !isVirtualCoachId(user.selectedVirtualCoachId)) {
    throw new Error('Choose a virtual coach before starting a check-in.');
  }

  const state = await getCheckInState(userId);
  const completedCount = await prisma.virtualCoachCheckIn.count({ where: { userId, status: 'COMPLETED' } });

  if (state.inProgressSession) {
    if (state.inProgressSession.coachId === user.selectedVirtualCoachId) {
      // Pre-kickoff users must not resume a legacy weekly in-progress session.
      if (completedCount === 0 && state.inProgressSession.kind !== 'KICKOFF') {
        await prisma.virtualCoachCheckIn.deleteMany({
          where: { id: state.inProgressSession.id, userId, status: 'IN_PROGRESS' }
        });
      } else {
        return state.inProgressSession;
      }
    }
  }
  if (!state.canStart) {
    throw new Error('Choose a virtual coach before starting a check-in.');
  }

  const coachId = user.selectedVirtualCoachId;
  const kind: VirtualCoachCheckInKind = completedCount === 0 ? 'KICKOFF' : 'WEEKLY';
  const transcript = emptyTranscript(kind);
  const turn = await runCoachTurn(userId, coachId, transcript.currentStage, transcript, undefined, kind);

  transcript.messages.push({
    role: 'coach',
    content: turn.message,
    at: new Date().toISOString()
  });
  if (turn.advance && transcript.currentStage !== 'recap') {
    transcript.currentStage = nextStage(transcript.currentStage, kind);
  }
  transcript.chips = turn.chips;

  const record = await prisma.virtualCoachCheckIn.create({
    data: {
      userId,
      coachId,
      kind,
      weekStart: parseDateParam(state.weekStart),
      status: 'IN_PROGRESS',
      transcript
    }
  });

  return {
    ...serializeSession(record),
    chips: turn.chips,
    done: turn.done
  };
}

export async function sendCheckInMessage(userId: string, sessionId: string, message: string) {
  const trimmed = message.trim();
  if (!trimmed) throw new Error('Message required');

  const record = await prisma.virtualCoachCheckIn.findFirst({
    where: { id: sessionId, userId, status: 'IN_PROGRESS' }
  });
  if (!record) throw new Error('Check-in session not found');
  if (!isVirtualCoachId(record.coachId)) throw new Error('Invalid coach on session');

  const transcript = parseTranscript(record.transcript, record.kind);
  const stageBeforeReply = transcript.currentStage;
  transcript.messages.push({ role: 'user', content: trimmed, at: new Date().toISOString() });

  const turn = await runCoachTurn(userId, record.coachId, transcript.currentStage, transcript, trimmed, record.kind);

  transcript.messages.push({
    role: 'coach',
    content: turn.message,
    at: new Date().toISOString()
  });

  if (turn.advance && transcript.currentStage !== 'recap') {
    transcript.currentStage = nextStage(transcript.currentStage, record.kind);
  }
  transcript.chips = turn.chips;

  const user = await ensureCheckInDay(userId);
  const nextDate = parseDateParam(nextCheckInDateKey(user.virtualCoachCheckInDay!, user.timezone));

  const updateData: {
    transcript: CheckInTranscript;
    status?: VirtualCoachCheckInStatus;
    feelingNote?: string;
    win?: string;
    pattern?: string;
    focus?: string;
    supportAction?: string;
    nextCheckInDate?: Date;
    completedAt?: Date;
  } = { transcript };

  if ((stageBeforeReply === 'opening' || stageBeforeReply === 'welcome') && trimmed) {
    updateData.feelingNote = trimmed.slice(0, 500);
  }
  if (record.kind === 'KICKOFF' && stageBeforeReply === 'why' && trimmed) {
    transcript.whyAnswer = trimmed.slice(0, 500);
  }

  if (turn.done && turn.recap) {
    updateData.status = 'COMPLETED';
    updateData.win = turn.recap.win;
    updateData.pattern = turn.recap.pattern;
    updateData.focus = turn.recap.focus;
    updateData.supportAction = turn.recap.supportAction;
    updateData.nextCheckInDate = nextDate;
    updateData.completedAt = new Date();
    transcript.currentStage = 'recap';
  }

  const updated = await prisma.virtualCoachCheckIn.update({
    where: { id: sessionId },
    data: updateData
  });

  if (updateData.status === 'COMPLETED' && record.kind === 'KICKOFF') {
    await persistMotivationSafely(userId, turn.recap?.motivation ?? transcript.whyAnswer);
  }

  if (updateData.status === 'COMPLETED') {
    scheduleMemoryExtraction(userId, 'check_in', transcriptToMemoryMessages(transcript.messages));
  }

  return {
    ...serializeSession(updated),
    chips: turn.chips,
    done: turn.done,
    planAdvance:
      updateData.status === 'COMPLETED'
        ? await advancePlanSafely(userId, user.timezone, record.kind === 'KICKOFF' ? 'kickoff' : 'weekly')
        : null
  };
}

export async function completeCheckIn(userId: string, sessionId: string) {
  const record = await prisma.virtualCoachCheckIn.findFirst({
    where: { id: sessionId, userId }
  });
  if (!record) throw new Error('Check-in session not found');

  if (record.status === 'COMPLETED') {
    return serializeSession(record);
  }

  const user = await ensureCheckInDay(userId);
  const nextDate = parseDateParam(nextCheckInDateKey(user.virtualCoachCheckInDay!, user.timezone));
  const transcript = parseTranscript(record.transcript, record.kind);

  const updated = await prisma.virtualCoachCheckIn.update({
    where: { id: sessionId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      nextCheckInDate: nextDate,
      transcript
    }
  });

  // Early completion has no model recap — the verbatim why answer is the best we have.
  if (record.kind === 'KICKOFF') {
    await persistMotivationSafely(userId, transcript.whyAnswer);
  }

  scheduleMemoryExtraction(userId, 'check_in', transcriptToMemoryMessages(transcript.messages));

  return {
    ...serializeSession(updated),
    planAdvance: await advancePlanSafely(userId, user.timezone, record.kind === 'KICKOFF' ? 'kickoff' : 'weekly')
  };
}

/** Plan advancement must never fail the check-in itself. */
async function advancePlanSafely(userId: string, timezone: string | null, mode: 'weekly' | 'kickoff' = 'weekly') {
  try {
    return await advancePlanForCheckIn(userId, timezone, mode);
  } catch (error) {
    console.error('Plan advancement after check-in failed', error);
    return null;
  }
}

export async function getCheckInHistory(userId: string, limit = 8) {
  const rows = await prisma.virtualCoachCheckIn.findMany({
    where: { userId, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    take: limit
  });
  return rows.map((row) => serializeSession(row));
}

export async function getWeekStats(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true }
  });
  return getWeeklyReview(userId, user?.timezone ?? null);
}
