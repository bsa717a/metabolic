import { ProgramStatus, Visibility, type Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { canAccessUser } from '../auth/requireRole.js';
import { parseDateParam, toDateKey, addUtcDays } from '../utils/dates.js';
import { getTodayDashboard } from './dashboardService.js';
import { ensureDailyLogByUserId } from './dailyLogService.js';
import { getScheduledExercises } from './exerciseService.js';
import { getGamificationDashboard } from './gamificationService.js';
import { getCoachHydrationStats, setWaterGoal } from './hydrationService.js';
import { getMealsForDate } from './nutritionService.js';
import { applyTemplateToDailyLog } from './nutritionTemplateService.js';
import { applyTemplateToDate } from './exerciseTemplateService.js';
import { sendResultsReadyEmail } from './emailService.js';
import { buildResultsReadyLinks, buildResultsReadySmsMessage } from './resultsReadyNotification.js';
import { sendOutboundMessage, validateOutboundRecipient, isTwilioSenderPhone } from './twilioOutboundService.js';
import { normalizePhone } from '../utils/phone.js';
import { env } from '../config/env.js';

export async function requireCoachClient(actor: { id: string; role: Role }, userId: string) {
  if (!(await canAccessUser(actor, userId))) {
    throw new Error('User is not assigned to this coach');
  }
}

async function loadLatestInboundPhones(userIds: string[]) {
  if (!userIds.length) return new Map<string, string>();

  const messages = await prisma.smsMessage.findMany({
    where: { userId: { in: userIds }, direction: 'INBOUND' },
    orderBy: { createdAt: 'desc' },
    select: { userId: true, phone: true }
  });

  const byUser = new Map<string, string>();
  for (const message of messages) {
    if (message.userId && !byUser.has(message.userId)) {
      byUser.set(message.userId, normalizePhone(message.phone));
    }
  }
  return byUser;
}

function resolveClientMessagingPhone(profilePhone: string | null | undefined, inboundPhone?: string | null) {
  const normalizedProfile = profilePhone?.trim() ? normalizePhone(profilePhone) : null;
  const normalizedInbound = inboundPhone?.trim() ? normalizePhone(inboundPhone) : null;

  if (normalizedProfile && !isTwilioSenderPhone(normalizedProfile)) {
    return normalizedProfile;
  }
  if (normalizedInbound && !isTwilioSenderPhone(normalizedInbound)) {
    return normalizedInbound;
  }
  return null;
}

export async function listCoachClients(coachId: string) {
  const assignments = await prisma.coachAssignment.findMany({
    where: { coachId },
    include: {
      user: {
        include: {
          programs: {
            where: { status: ProgramStatus.ACTIVE },
            include: { metrics: true },
            take: 1
          },
          dailyLogs: {
            orderBy: { date: 'desc' },
            take: 1
          },
          progressSnapshots: {
            orderBy: { snapshotDate: 'desc' },
            take: 1
          }
        }
      }
    },
    orderBy: [{ user: { firstName: 'asc' } }, { user: { lastName: 'asc' } }]
  });

  const inboundPhones = await loadLatestInboundPhones(assignments.map((assignment) => assignment.user.id));
  const userIds = assignments.map((assignment) => assignment.user.id);
  const now = new Date();
  const nowMs = now.getTime();
  const maxCheckInDurationMs = 60 * 60 * 1000;
  const relevantCheckIns = userIds.length
    ? await prisma.coachCheckIn.findMany({
        where: {
          coachId,
          userId: { in: userIds },
          startsAt: { gte: new Date(nowMs - maxCheckInDurationMs) }
        },
        orderBy: { startsAt: 'asc' },
        select: { userId: true, startsAt: true, durationMinutes: true }
      })
    : [];
  const nextCheckInByUserId = new Map<string, string>();
  for (const checkIn of relevantCheckIns) {
    const endsAtMs = checkIn.startsAt.getTime() + checkIn.durationMinutes * 60_000;
    if (endsAtMs <= nowMs) continue;
    if (!nextCheckInByUserId.has(checkIn.userId)) {
      nextCheckInByUserId.set(checkIn.userId, checkIn.startsAt.toISOString());
    }
  }

  return assignments.map((assignment) => {
    const user = assignment.user;
    const program = user.programs[0] ?? null;
    const weightMetric = program?.metrics.find((metric) => metric.metricType === 'WEIGHT') ?? null;
    const latestDailyLog = user.dailyLogs[0] ?? null;
    const latestProgressSnapshot = user.progressSnapshots[0] ?? null;
    const textPhone = resolveClientMessagingPhone(user.phone, inboundPhones.get(user.id));

    const compliancePct = computeCompliancePct(latestDailyLog);
    const lastActivityAt =
      latestDailyLog?.date.toISOString().slice(0, 10) ??
      latestProgressSnapshot?.snapshotDate.toISOString().slice(0, 10) ??
      null;
    const nextSessionAt = nextCheckInByUserId.get(user.id) ?? null;
    const needsAttention = computeNeedsAttention(compliancePct, lastActivityAt, nowMs);

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      textPhone,
      status: user.status,
      assignedAt: assignment.createdAt.toISOString(),
      activeProgram: program
        ? {
            id: program.id,
            name: program.name,
            startDate: program.startDate.toISOString(),
            currentWeight: weightMetric == null ? null : Number(weightMetric.currentValue),
            metricCount: program.metrics.length
          }
        : null,
      latestDailyLog: latestDailyLog
        ? {
            date: latestDailyLog.date.toISOString().slice(0, 10),
            mealsCompleted: latestDailyLog.mealsCompleted,
            mealsPlanned: latestDailyLog.mealsPlanned,
            exercisesCompleted: latestDailyLog.exercisesCompleted,
            exercisesPlanned: latestDailyLog.exercisesPlanned
          }
        : null,
      latestProgressSnapshot: latestProgressSnapshot
        ? {
            snapshotDate: latestProgressSnapshot.snapshotDate.toISOString().slice(0, 10),
            weight: latestProgressSnapshot.weight == null ? null : Number(latestProgressSnapshot.weight),
            completionStatus: latestProgressSnapshot.completionStatus
          }
        : null,
      nextCheckInAt: nextSessionAt,
      nextSessionAt,
      compliancePct,
      lastActivityAt,
      needsAttention
    };
  });
}

function computeCompliancePct(
  log: { mealsCompleted: number; mealsPlanned: number; exercisesCompleted: number; exercisesPlanned: number } | null
): number | null {
  if (!log) return null;
  const parts: number[] = [];
  if (log.mealsPlanned > 0) parts.push((log.mealsCompleted / log.mealsPlanned) * 100);
  if (log.exercisesPlanned > 0) parts.push((log.exercisesCompleted / log.exercisesPlanned) * 100);
  if (!parts.length) return null;
  return Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length);
}

function computeNeedsAttention(compliancePct: number | null, lastActivityAt: string | null, nowMs: number): boolean {
  if (compliancePct != null && compliancePct < 50) return true;
  if (!lastActivityAt) return true;
  const lastMs = new Date(`${lastActivityAt}T12:00:00Z`).getTime();
  const daysSince = Math.floor((nowMs - lastMs) / (24 * 60 * 60 * 1000));
  return daysSince > 3;
}

function normalizeCoachCode(value?: string | null) {
  const code = value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code || null;
}

export async function getCoachSettings(coachId: string) {
  const coach = await prisma.user.findUniqueOrThrow({
    where: { id: coachId },
    select: {
      coachCode: true,
      defaultNutritionTemplateId: true,
      defaultExerciseTemplateId: true
    }
  });
  return coach;
}

export async function updateCoachSettings(
  coachId: string,
  data: {
    coachCode?: string | null;
    defaultNutritionTemplateId?: string | null;
    defaultExerciseTemplateId?: string | null;
  }
) {
  if (data.defaultNutritionTemplateId) {
    await ensureTemplateAvailableToCoach('nutrition', coachId, data.defaultNutritionTemplateId);
  }
  if (data.defaultExerciseTemplateId) {
    await ensureTemplateAvailableToCoach('exercise', coachId, data.defaultExerciseTemplateId);
  }
  const updated = await prisma.user.update({
    where: { id: coachId },
    data: {
      coachCode: data.coachCode === undefined ? undefined : normalizeCoachCode(data.coachCode),
      defaultNutritionTemplateId: data.defaultNutritionTemplateId,
      defaultExerciseTemplateId: data.defaultExerciseTemplateId
    },
    select: {
      coachCode: true,
      defaultNutritionTemplateId: true,
      defaultExerciseTemplateId: true
    }
  });
  return updated;
}

export async function getCoachClientDashboard(actor: { id: string; role: Role }, userId: string) {
  await requireCoachClient(actor, userId);
  return getTodayDashboard(userId);
}

export async function getCoachClientMeals(actor: { id: string; role: Role }, userId: string, date: string) {
  await requireCoachClient(actor, userId);
  const log = await ensureDailyLogByUserId(userId, date);
  if (!log) throw new Error('No active program found');
  return getMealsForDate(userId, date);
}

export async function getCoachClientExercises(actor: { id: string; role: Role }, userId: string, date: string) {
  await requireCoachClient(actor, userId);
  const log = await ensureDailyLogByUserId(userId, date);
  if (!log) throw new Error('No active program found');
  return getScheduledExercises(userId, date);
}

function serializeCoachSession(session: {
  id: string;
  coachId: string;
  userId: string;
  occurredAt: Date;
  notes: string;
  linkedCheckInId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: session.id,
    coachId: session.coachId,
    userId: session.userId,
    occurredAt: session.occurredAt.toISOString(),
    notes: session.notes,
    linkedCheckInId: session.linkedCheckInId,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString()
  };
}

async function requireLinkedCheckInForSession(
  coachId: string,
  userId: string,
  linkedCheckInId: string | null | undefined
) {
  if (linkedCheckInId == null) return;
  const checkIn = await prisma.coachCheckIn.findUnique({
    where: { id: linkedCheckInId },
    select: { coachId: true, userId: true }
  });
  if (!checkIn || checkIn.coachId !== coachId || checkIn.userId !== userId) {
    throw new Error('Check-in does not belong to this coach and client');
  }
}

export async function listCoachSessions(actor: { id: string; role: Role }, userId: string) {
  await requireCoachClient(actor, userId);
  const sessions = await prisma.coachSession.findMany({
    where: { coachId: actor.id, userId },
    orderBy: { occurredAt: 'desc' }
  });
  return sessions.map(serializeCoachSession);
}

export async function createCoachSession(
  actor: { id: string; role: Role },
  data: { userId: string; notes: string; occurredAt?: string; linkedCheckInId?: string | null }
) {
  await requireCoachClient(actor, data.userId);
  await requireLinkedCheckInForSession(actor.id, data.userId, data.linkedCheckInId);
  const session = await prisma.coachSession.create({
    data: {
      coachId: actor.id,
      userId: data.userId,
      notes: data.notes,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : undefined,
      linkedCheckInId: data.linkedCheckInId ?? null
    }
  });
  return serializeCoachSession(session);
}

export async function updateCoachSession(
  actor: { id: string; role: Role },
  sessionId: string,
  data: { notes?: string; occurredAt?: string; linkedCheckInId?: string | null }
) {
  const existing = await prisma.coachSession.findUnique({ where: { id: sessionId } });
  if (!existing || existing.coachId !== actor.id) throw new Error('Session not found');

  await requireLinkedCheckInForSession(actor.id, existing.userId, data.linkedCheckInId);

  const session = await prisma.coachSession.update({
    where: { id: sessionId },
    data: {
      notes: data.notes,
      occurredAt: data.occurredAt ? new Date(data.occurredAt) : undefined,
      linkedCheckInId: data.linkedCheckInId === undefined ? undefined : data.linkedCheckInId
    }
  });
  return serializeCoachSession(session);
}

export async function getCoachClientEngagement(actor: { id: string; role: Role }, userId: string) {
  await requireCoachClient(actor, userId);
  const [engagement, hydration] = await Promise.all([
    getGamificationDashboard(userId),
    getCoachHydrationStats(userId)
  ]);
  return { ...engagement, hydration };
}

export async function getCoachClientHydration(actor: { id: string; role: Role }, userId: string) {
  await requireCoachClient(actor, userId);
  return getCoachHydrationStats(userId);
}

export async function setCoachClientWaterGoal(
  actor: { id: string; role: Role },
  userId: string,
  goalOz: number
) {
  await requireCoachClient(actor, userId);
  return setWaterGoal(userId, goalOz);
}

export async function sendCoachResultsReadyEmail(
  actor: { id: string; role: Role; firstName: string; lastName: string },
  userId: string
) {
  const { client, coachName, links } = await getCoachResultsNotificationContext(actor, userId);

  await sendResultsReadyEmail({
    to: client.email,
    clientFirstName: client.firstName,
    coachName,
    links
  });

  return { sent: true, to: client.email };
}

export async function sendCoachResultsReadySms(
  actor: { id: string; role: Role; firstName: string; lastName: string },
  userId: string,
  options?: { phone?: string; savePhone?: boolean }
) {
  const { client, coachName, links } = await getCoachResultsNotificationContext(actor, userId);
  const inboundPhones = await loadLatestInboundPhones([userId]);
  const resolvedPhone = resolveClientMessagingPhone(client.phone, inboundPhones.get(userId));

  let phone: string | null;
  if (options?.phone?.trim()) {
    if (!options.savePhone) {
      throw new Error('A custom phone number can only be provided when saving it to the client profile.');
    }
    phone = normalizePhone(options.phone);
  } else {
    phone = resolvedPhone;
  }

  if (!phone) {
    throw new Error(
      'This client does not have a phone number on file. Add one in Admin → Users or enter it when sending.'
    );
  }

  validateOutboundRecipient(phone);

  const message = buildResultsReadySmsMessage({
    clientFirstName: client.firstName,
    coachName,
    links
  });

  try {
    await sendOutboundMessage(phone, message);
    if (options?.savePhone && !client.phone?.trim()) {
      await prisma.user.update({ where: { id: userId }, data: { phone } });
    }
    await prisma.smsMessage.create({
      data: {
        phone,
        userId,
        direction: 'OUTBOUND',
        message,
        intent: 'RESULTS_READY',
        response: message,
        status: 'PROCESSED'
      }
    });
  } catch (error) {
    await prisma.smsMessage.create({
      data: {
        phone,
        userId,
        direction: 'OUTBOUND',
        message,
        intent: 'RESULTS_READY',
        response: error instanceof Error ? error.message : 'Failed to send text message',
        status: 'FAILED'
      }
    });
    throw error;
  }

  return { sent: true, to: phone };
}

async function getCoachResultsNotificationContext(
  actor: { id: string; role: Role; firstName: string; lastName: string },
  userId: string
) {
  await requireCoachClient(actor, userId);

  const client = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, firstName: true, phone: true }
  });
  const coachName = `${actor.firstName} ${actor.lastName}`.trim() || 'Your coach';
  const links = buildResultsReadyLinks(env.CLIENT_URL);

  return { client, coachName, links };
}

export async function listCoachNutritionTemplates(coachId: string) {
  const { listTemplatesForActor } = await import('./nutritionTemplateService.js');
  return listTemplatesForActor({ id: coachId, role: 'COACH' });
}

export async function listCoachExerciseTemplates(coachId: string) {
  const { listTemplatesForActor } = await import('./exerciseTemplateService.js');
  return listTemplatesForActor({ id: coachId, role: 'COACH' });
}

export async function applyCoachNutritionTemplate(
  actor: { id: string; role: Role },
  userId: string,
  date: string,
  templateId: string,
  options?: { setAsDefault?: boolean }
) {
  await requireCoachClient(actor, userId);
  await ensureTemplateAvailableToCoach('nutrition', actor.id, templateId);
  return applyTemplateToDailyLog(userId, date, templateId, { ...options, actorId: actor.id });
}

export async function applyCoachExerciseTemplate(
  actor: { id: string; role: Role },
  userId: string,
  date: string,
  templateId: string,
  options?: { setAsDefault?: boolean }
) {
  await requireCoachClient(actor, userId);
  await ensureTemplateAvailableToCoach('exercise', actor.id, templateId);
  return applyTemplateToDate(userId, date, templateId, { ...options, actorId: actor.id });
}

async function ensureTemplateAvailableToCoach(kind: 'nutrition' | 'exercise', coachId: string, templateId: string) {
  const template =
    kind === 'nutrition'
      ? await prisma.nutritionPlanTemplate.findUnique({ where: { id: templateId } })
      : await prisma.exerciseTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new Error('Template not found');
  if (template.visibility === Visibility.GLOBAL || template.createdById === coachId) return;
  throw new Error('Template not available');
}

function mapClientGroup(
  group: {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    members: { userId: string }[];
  },
  coachClientIds: Set<string>
) {
  const memberIds = group.members.map((member) => member.userId).filter((userId) => coachClientIds.has(userId));
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    memberIds,
    memberCount: memberIds.length,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString()
  };
}

async function getCoachClientIds(coachId: string) {
  const assignments = await prisma.coachAssignment.findMany({
    where: { coachId },
    select: { userId: true }
  });
  return new Set(assignments.map((assignment) => assignment.userId));
}

async function requireCoachOwnedGroup(coachId: string, groupId: string) {
  const group = await prisma.clientGroup.findFirst({
    where: { id: groupId, coachId },
    include: { members: { select: { userId: true } } }
  });
  if (!group) throw new Error('Client group not found');
  return group;
}

export async function listCoachClientGroups(coachId: string) {
  const coachClientIds = await getCoachClientIds(coachId);
  const groups = await prisma.clientGroup.findMany({
    where: { coachId },
    include: { members: { select: { userId: true } } },
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }]
  });
  return groups.map((group) => mapClientGroup(group, coachClientIds));
}

export async function createCoachClientGroup(
  coachId: string,
  data: { name: string; description?: string | null; memberIds?: string[] }
) {
  const name = data.name.trim();
  if (!name) throw new Error('Group name is required');

  const coachClientIds = await getCoachClientIds(coachId);
  const memberIds = [...new Set(data.memberIds ?? [])];
  if (memberIds.some((userId) => !coachClientIds.has(userId))) {
    throw new Error('One or more users are not assigned to this coach');
  }

  const group = await prisma.clientGroup.create({
    data: {
      coachId,
      name,
      description: data.description?.trim() || null,
      members: memberIds.length ? { create: memberIds.map((userId) => ({ userId })) } : undefined
    },
    include: { members: { select: { userId: true } } }
  });
  return mapClientGroup(group, coachClientIds);
}

export async function updateCoachClientGroup(
  coachId: string,
  groupId: string,
  data: { name?: string; description?: string | null }
) {
  await requireCoachOwnedGroup(coachId, groupId);
  const coachClientIds = await getCoachClientIds(coachId);
  const name = data.name === undefined ? undefined : data.name.trim();
  if (name === '') throw new Error('Group name is required');

  const group = await prisma.clientGroup.update({
    where: { id: groupId },
    data: {
      name,
      description: data.description === undefined ? undefined : data.description?.trim() || null
    },
    include: { members: { select: { userId: true } } }
  });
  return mapClientGroup(group, coachClientIds);
}

export async function deleteCoachClientGroup(coachId: string, groupId: string) {
  await requireCoachOwnedGroup(coachId, groupId);
  await prisma.clientGroup.delete({ where: { id: groupId } });
}

export async function setCoachClientGroupMembers(coachId: string, groupId: string, memberIds: string[]) {
  await requireCoachOwnedGroup(coachId, groupId);
  const coachClientIds = await getCoachClientIds(coachId);
  const uniqueMemberIds = [...new Set(memberIds)];
  if (uniqueMemberIds.some((userId) => !coachClientIds.has(userId))) {
    throw new Error('One or more users are not assigned to this coach');
  }

  const group = await prisma.$transaction(async (tx) => {
    await tx.clientGroupMember.deleteMany({ where: { groupId } });
    if (uniqueMemberIds.length) {
      await tx.clientGroupMember.createMany({
        data: uniqueMemberIds.map((userId) => ({ groupId, userId }))
      });
    }
    return tx.clientGroup.findUniqueOrThrow({
      where: { id: groupId },
      include: { members: { select: { userId: true } } }
    });
  });
  return mapClientGroup(group, coachClientIds);
}

export type CoachCalendarEventType =
  | 'daily_log'
  | 'exercise_plan'
  | 'metric_snapshot'
  | 'progress_snapshot'
  | 'program_start'
  | 'program_end'
  | 'check_in';

export type CoachCalendarEvent = {
  id: string;
  date: string;
  type: CoachCalendarEventType;
  userId: string;
  userName: string;
  title: string;
  detail?: string;
  checkInId?: string;
  startsAt?: string;
  durationMinutes?: number;
};

export type CoachCheckInRecord = {
  id: string;
  userId: string;
  userName: string;
  startsAt: string;
  durationMinutes: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

const CHECK_IN_DURATIONS = new Set([30, 60]);

const MAX_CALENDAR_RANGE_DAYS = 93;

function calendarRangeDays(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

async function getCoachCalendarClientIds(coachId: string, groupId?: string | null) {
  const coachClientIds = await getCoachClientIds(coachId);
  if (!groupId) return [...coachClientIds];
  const group = await requireCoachOwnedGroup(coachId, groupId);
  return group.members.map((member) => member.userId).filter((userId) => coachClientIds.has(userId));
}

async function requireCoachAssignedClient(coachId: string, userId: string) {
  const coachClientIds = await getCoachClientIds(coachId);
  if (!coachClientIds.has(userId)) throw new Error('User is not assigned to this coach');
}

async function requireCoachOwnedCheckIn(coachId: string, checkInId: string) {
  const checkIn = await prisma.coachCheckIn.findFirst({ where: { id: checkInId, coachId } });
  if (!checkIn) throw new Error('Check-in not found');
  return checkIn;
}

function parseCheckInStartsAt(value: string) {
  const startsAt = new Date(value);
  if (Number.isNaN(startsAt.getTime())) throw new Error('Invalid start time');
  return startsAt;
}
function mapCoachCheckIn(
  checkIn: {
    id: string;
    userId: string;
    startsAt: Date;
    durationMinutes: number;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  userNameById: Map<string, string>
): CoachCheckInRecord {
  return {
    id: checkIn.id,
    userId: checkIn.userId,
    userName: userNameById.get(checkIn.userId) ?? 'Client',
    startsAt: checkIn.startsAt.toISOString(),
    durationMinutes: checkIn.durationMinutes,
    notes: checkIn.notes,
    createdAt: checkIn.createdAt.toISOString(),
    updatedAt: checkIn.updatedAt.toISOString()
  };
}

export async function createCoachCheckIn(
  coachId: string,
  data: { userId: string; startsAt: string; durationMinutes: number; notes?: string | null }
) {
  if (!CHECK_IN_DURATIONS.has(data.durationMinutes)) {
    throw new Error('Check-in duration must be 30 or 60 minutes');
  }
  await requireCoachAssignedClient(coachId, data.userId);
  const startsAt = parseCheckInStartsAt(data.startsAt);

  const checkIn = await prisma.coachCheckIn.create({
    data: {
      coachId,
      userId: data.userId,
      startsAt,
      durationMinutes: data.durationMinutes,
      notes: data.notes?.trim() || null
    }
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: data.userId },
    select: { firstName: true, lastName: true }
  });
  return mapCoachCheckIn(checkIn, new Map([[data.userId, `${user.firstName} ${user.lastName}`.trim()]]));
}

export async function updateCoachCheckIn(
  coachId: string,
  checkInId: string,
  data: { userId?: string; startsAt?: string; durationMinutes?: number; notes?: string | null }
) {
  const existing = await requireCoachOwnedCheckIn(coachId, checkInId);
  const userId = data.userId ?? existing.userId;
  await requireCoachAssignedClient(coachId, userId);

  if (data.durationMinutes !== undefined && !CHECK_IN_DURATIONS.has(data.durationMinutes)) {
    throw new Error('Check-in duration must be 30 or 60 minutes');
  }

  const checkIn = await prisma.coachCheckIn.update({
    where: { id: checkInId },
    data: {
      userId,
      startsAt: data.startsAt === undefined ? undefined : parseCheckInStartsAt(data.startsAt),
      durationMinutes: data.durationMinutes,
      notes: data.notes === undefined ? undefined : data.notes?.trim() || null
    }
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: checkIn.userId },
    select: { firstName: true, lastName: true }
  });
  return mapCoachCheckIn(checkIn, new Map([[checkIn.userId, `${user.firstName} ${user.lastName}`.trim()]]));
}

export async function deleteCoachCheckIn(coachId: string, checkInId: string) {
  await requireCoachOwnedCheckIn(coachId, checkInId);
  await prisma.coachCheckIn.delete({ where: { id: checkInId } });
}

export async function getCoachCalendar(
  coachId: string,
  start: string,
  end: string,
  options?: { groupId?: string | null }
) {
  const startDate = parseDateParam(start);
  const endDate = parseDateParam(end);
  if (startDate > endDate) throw new Error('Start date must be on or before end date');
  if (calendarRangeDays(startDate, endDate) > MAX_CALENDAR_RANGE_DAYS) {
    throw new Error(`Date range cannot exceed ${MAX_CALENDAR_RANGE_DAYS} days`);
  }

  const clientIds = await getCoachCalendarClientIds(coachId, options?.groupId);
  if (!clientIds.length) return { start, end, events: [] as CoachCalendarEvent[] };

  const users = await prisma.user.findMany({
    where: { id: { in: clientIds } },
    select: { id: true, firstName: true, lastName: true }
  });
  const userNameById = new Map(users.map((user) => [user.id, `${user.firstName} ${user.lastName}`.trim()]));

  const rangeEndExclusive = addUtcDays(endDate, 1);

  const [dailyLogs, scheduledExercises, metricSnapshots, progressSnapshots, programs, checkIns] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId: { in: clientIds }, date: { gte: startDate, lte: endDate } },
      select: {
        id: true,
        userId: true,
        date: true,
        mealsPlanned: true,
        mealsCompleted: true,
        exercisesPlanned: true,
        exercisesCompleted: true
      }
    }),
    prisma.scheduledExercise.findMany({
      where: { userId: { in: clientIds }, scheduledDate: { gte: startDate, lte: endDate } },
      select: { id: true, userId: true, scheduledDate: true, status: true }
    }),
    prisma.programMetricSnapshot.findMany({
      where: {
        program: { userId: { in: clientIds } },
        date: { gte: startDate, lte: endDate }
      },
      select: {
        id: true,
        date: true,
        program: { select: { userId: true, name: true } }
      }
    }),
    prisma.progressSnapshot.findMany({
      where: { userId: { in: clientIds }, snapshotDate: { gte: startDate, lte: endDate } },
      select: { id: true, userId: true, snapshotDate: true, completionStatus: true }
    }),
    prisma.program.findMany({
      where: {
        userId: { in: clientIds },
        status: ProgramStatus.ACTIVE,
        OR: [
          { startDate: { gte: startDate, lte: endDate } },
          { targetEndDate: { gte: startDate, lte: endDate } }
        ]
      },
      select: { id: true, userId: true, name: true, startDate: true, targetEndDate: true }
    }),
    prisma.coachCheckIn.findMany({
      where: {
        coachId,
        userId: { in: clientIds },
        startsAt: { gte: startDate, lt: rangeEndExclusive }
      },
      select: {
        id: true,
        userId: true,
        startsAt: true,
        durationMinutes: true,
        notes: true
      }
    })
  ]);

  const events: CoachCalendarEvent[] = [];
  const dailyLogKeys = new Set<string>();

  for (const log of dailyLogs) {
    const date = toDateKey(log.date);
    dailyLogKeys.add(`${log.userId}:${date}`);
    if (
      log.mealsPlanned === 0 &&
      log.exercisesPlanned === 0 &&
      log.mealsCompleted === 0 &&
      log.exercisesCompleted === 0
    ) {
      continue;
    }
    const parts: string[] = [];
    if (log.mealsPlanned > 0 || log.mealsCompleted > 0) {
      parts.push(`Meals ${log.mealsCompleted}/${log.mealsPlanned}`);
    }
    if (log.exercisesPlanned > 0 || log.exercisesCompleted > 0) {
      parts.push(`Exercise ${log.exercisesCompleted}/${log.exercisesPlanned}`);
    }
    events.push({
      id: `daily_log:${log.id}`,
      date,
      type: 'daily_log',
      userId: log.userId,
      userName: userNameById.get(log.userId) ?? 'Client',
      title: parts.join(' · ') || 'Daily activity'
    });
  }

  const exerciseByDay = new Map<string, { planned: number; done: number }>();
  for (const exercise of scheduledExercises) {
    const date = toDateKey(exercise.scheduledDate);
    const key = `${exercise.userId}:${date}`;
    const current = exerciseByDay.get(key) ?? { planned: 0, done: 0 };
    current.planned += 1;
    if (exercise.status === 'DONE') current.done += 1;
    exerciseByDay.set(key, current);
  }

  for (const [key, stats] of exerciseByDay) {
    if (dailyLogKeys.has(key) || stats.planned === 0) continue;
    const [userId, date] = key.split(':');
    events.push({
      id: `exercise_plan:${userId}:${date}`,
      date,
      type: 'exercise_plan',
      userId,
      userName: userNameById.get(userId) ?? 'Client',
      title: `Exercise ${stats.done}/${stats.planned}`
    });
  }

  for (const snapshot of metricSnapshots) {
    const date = toDateKey(snapshot.date);
    events.push({
      id: `metric_snapshot:${snapshot.id}`,
      date,
      type: 'metric_snapshot',
      userId: snapshot.program.userId,
      userName: userNameById.get(snapshot.program.userId) ?? 'Client',
      title: 'Body metrics snapshot',
      detail: snapshot.program.name
    });
  }

  for (const snapshot of progressSnapshots) {
    const date = toDateKey(snapshot.snapshotDate);
    events.push({
      id: `progress_snapshot:${snapshot.id}`,
      date,
      type: 'progress_snapshot',
      userId: snapshot.userId,
      userName: userNameById.get(snapshot.userId) ?? 'Client',
      title: snapshot.completionStatus === 'COMPLETE' ? 'Progress snapshot complete' : 'Progress snapshot started',
      detail: snapshot.completionStatus === 'COMPLETE' ? undefined : 'Draft'
    });
  }

  for (const program of programs) {
    const startKey = toDateKey(program.startDate);
    if (startKey >= start && startKey <= end) {
      events.push({
        id: `program_start:${program.id}`,
        date: startKey,
        type: 'program_start',
        userId: program.userId,
        userName: userNameById.get(program.userId) ?? 'Client',
        title: 'Program started',
        detail: program.name
      });
    }
    if (program.targetEndDate) {
      const endKey = toDateKey(program.targetEndDate);
      if (endKey >= start && endKey <= end) {
        events.push({
          id: `program_end:${program.id}`,
          date: endKey,
          type: 'program_end',
          userId: program.userId,
          userName: userNameById.get(program.userId) ?? 'Client',
          title: 'Program target end',
          detail: program.name
        });
      }
    }
  }

  for (const checkIn of checkIns) {
    const startsAt = checkIn.startsAt.toISOString();
    const date = toDateKey(checkIn.startsAt);
    const durationLabel = checkIn.durationMinutes === 60 ? '1 hour' : '30 minutes';
    events.push({
      id: `check_in:${checkIn.id}`,
      checkInId: checkIn.id,
      date,
      type: 'check_in',
      userId: checkIn.userId,
      userName: userNameById.get(checkIn.userId) ?? 'Client',
      title: `Check-in · ${durationLabel}`,
      detail: checkIn.notes ?? undefined,
      startsAt,
      durationMinutes: checkIn.durationMinutes
    });
  }

  events.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    if (a.startsAt && b.startsAt) return a.startsAt.localeCompare(b.startsAt);
    if (a.startsAt) return -1;
    if (b.startsAt) return 1;
    return a.userName.localeCompare(b.userName) || a.title.localeCompare(b.title);
  });

  return { start, end, events };
}
