import type { VirtualCoachCheckInStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { isVirtualCoachId, type VirtualCoachId } from '../data/virtualCoachPersonas.js';
import { addUtcDays, parseDateParam, toDateKey, userDayKey } from '../utils/dates.js';
import { getAiProvider } from './aiService.js';
import { buildCoachCheckInSystemPrompt } from './coachPersona.js';
import { getWeeklyReview, startOfWeekMonday } from './weeklyReviewService.js';

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

export type CheckInStage = (typeof CHECK_IN_STAGES)[number];

export type TranscriptMessage = {
  role: 'coach' | 'user';
  content: string;
  at: string;
};

export type CheckInTranscript = {
  currentStage: CheckInStage;
  messages: TranscriptMessage[];
  chips?: string[];
};

export type CheckInRecapFields = {
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

function parseTranscript(value: unknown): CheckInTranscript {
  const raw = value as Partial<CheckInTranscript> | null;
  const stage = raw?.currentStage;
  const currentStage = CHECK_IN_STAGES.includes(stage as CheckInStage) ? (stage as CheckInStage) : 'opening';
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
  return { currentStage, messages, chips };
}

function emptyTranscript(): CheckInTranscript {
  return { currentStage: 'opening', messages: [] };
}

function nextStage(stage: CheckInStage): CheckInStage {
  const index = CHECK_IN_STAGES.indexOf(stage);
  return CHECK_IN_STAGES[Math.min(index + 1, CHECK_IN_STAGES.length - 1)];
}

function nextCheckInDateKey(checkInDay: number, timeZone: string | null | undefined, from = new Date()) {
  const todayDow = localDayOfWeek(timeZone, from);
  let daysUntil = (checkInDay - todayDow + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  const todayKey = userDayKey(timeZone, from);
  return toDateKey(addUtcDays(parseDateParam(todayKey), daysUntil));
}

function serializeRecap(record: {
  feelingNote: string | null;
  win: string | null;
  pattern: string | null;
  focus: string | null;
  supportAction: string | null;
  nextCheckInDate: Date | null;
  completedAt: Date | null;
}): CheckInRecapFields {
  return {
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
  const transcript = parseTranscript(record.transcript);
  return {
    id: record.id,
    coachId: record.coachId,
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

/**
 * The model tends to address the user by name in nearly every message, which feels
 * unnerving. Keep the name only ~30% of the time (chosen at random) and otherwise
 * strip the common vocative/greeting forms while keeping the sentence natural.
 */
const KEEP_NAME_PROBABILITY = 0.3;

export function softenCoachName(message: string, firstName?: string | null): string {
  const name = firstName?.trim();
  if (!message || !name) return message;
  if (Math.random() < KEEP_NAME_PROBABILITY) return message;

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = message;
  // "Hey Derek" / "Hi Derek" / "Okay Derek" -> drop the name, keep the greeting.
  out = out.replace(new RegExp(`\\b(hey|hi|hello|okay|ok|alright|well|so|oh)\\s+${escaped}\\b`, 'gi'), '$1');
  // Vocative comma forms: "great, Derek" and "Derek, let's" -> remove the address.
  out = out.replace(new RegExp(`\\s*,\\s*${escaped}\\b(?!['’]s)`, 'gi'), '');
  out = out.replace(new RegExp(`\\b${escaped}\\b(?!['’]s)\\s*,\\s*`, 'gi'), '');
  // Any remaining standalone use (not possessive), with trailing ! or .
  out = out.replace(new RegExp(`\\b${escaped}\\b(?!['’]s)[!.]?`, 'gi'), '');
  // Tidy spacing and punctuation left behind.
  out = out
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/^[\s,]+/, '')
    .trim();
  if (out) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out || message;
}

async function runCoachTurn(
  userId: string,
  coachId: VirtualCoachId,
  stage: CheckInStage,
  transcript: CheckInTranscript,
  userMessage?: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, timezone: true }
  });
  if (!user) throw new Error('User not found');

  const weeklyReview = await getWeeklyReview(userId, user.timezone);
  const systemPrompt = buildCoachCheckInSystemPrompt(coachId, user.firstName);

  const turn = await getAiProvider().coachCheckInTurn({
    coachId,
    stage,
    systemPrompt,
    weeklyReview,
    transcript: transcript.messages,
    userMessage,
    userFirstName: user.firstName
  });

  return { ...turn, message: softenCoachName(turn.message, user.firstName) };
}

export async function startCheckIn(userId: string) {
  const user = await ensureCheckInDay(userId);
  if (!user.selectedVirtualCoachId || !isVirtualCoachId(user.selectedVirtualCoachId)) {
    throw new Error('Choose a virtual coach before starting a check-in.');
  }

  const state = await getCheckInState(userId);
  if (state.inProgressSession) {
    if (state.inProgressSession.coachId === user.selectedVirtualCoachId) {
      return state.inProgressSession;
    }
  }
  if (!state.canStart) {
    throw new Error('Choose a virtual coach before starting a check-in.');
  }

  const coachId = user.selectedVirtualCoachId;
  const transcript = emptyTranscript();
  const turn = await runCoachTurn(userId, coachId, transcript.currentStage, transcript);

  transcript.messages.push({
    role: 'coach',
    content: turn.message,
    at: new Date().toISOString()
  });
  if (turn.advance && transcript.currentStage !== 'recap') {
    transcript.currentStage = nextStage(transcript.currentStage);
  }
  transcript.chips = turn.chips;

  const record = await prisma.virtualCoachCheckIn.create({
    data: {
      userId,
      coachId,
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

  const transcript = parseTranscript(record.transcript);
  const stageBeforeReply = transcript.currentStage;
  transcript.messages.push({ role: 'user', content: trimmed, at: new Date().toISOString() });

  const turn = await runCoachTurn(userId, record.coachId, transcript.currentStage, transcript, trimmed);

  transcript.messages.push({
    role: 'coach',
    content: turn.message,
    at: new Date().toISOString()
  });

  if (turn.advance && transcript.currentStage !== 'recap') {
    transcript.currentStage = nextStage(transcript.currentStage);
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

  if (stageBeforeReply === 'opening' && trimmed) {
    updateData.feelingNote = trimmed.slice(0, 500);
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

  return {
    ...serializeSession(updated),
    chips: turn.chips,
    done: turn.done
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
  const transcript = parseTranscript(record.transcript);

  const updated = await prisma.virtualCoachCheckIn.update({
    where: { id: sessionId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      nextCheckInDate: nextDate,
      transcript
    }
  });

  return serializeSession(updated);
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
