import { ProgramStatus, type Role } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { canAccessProgramClient } from '../auth/requireRole.js';
import { getProgramForRead } from './programService.js';
import { getBloodPanelHistoryForExport } from './bloodPanelService.js';
import { n, round } from '../utils/numbers.js';

type Actor = { id: string; role: Role };

const METRIC_LABELS: Record<string, string> = {
  WEIGHT: 'Weight',
  BODY_FAT: 'Body fat',
  LEAN_TISSUE_MASS: 'Lean tissue mass',
  FAT_MASS: 'Fat mass',
  WAIST: 'Waist',
  HIPS: 'Hips',
  CHEST: 'Chest',
  CALORIES: 'Calories',
  PROTEIN: 'Protein',
  CARBS: 'Carbs',
  FAT: 'Fat'
};

function metricLabel(metricType: string) {
  return METRIC_LABELS[metricType] ?? metricType.replaceAll('_', ' ');
}

export async function getProgressSummary(actor: Actor, programId: string) {
  const program = await getProgramForRead(actor, programId);
  if (!program) throw new Error('Program not found');

  const userId = program.userId;

  const client = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true, email: true }
  });

  const [metricSnapshots, progressPhotos, weightLogs, bodyCompositionLogs, bloodPanels] = await Promise.all([
    prisma.programMetricSnapshot.findMany({
      where: { programId },
      include: { values: true },
      orderBy: { date: 'desc' },
      take: 8
    }),
    prisma.programProgressPhotoSet.findMany({
      where: { programId },
      orderBy: { date: 'desc' },
      take: 6
    }),
    prisma.dailyLog.findMany({
      where: { userId, weight: { not: null } },
      orderBy: { date: 'desc' },
      take: 60,
      select: { date: true, weight: true }
    }),
    prisma.dailyLog.findMany({
      where: {
        userId,
        OR: [{ bodyFat: { not: null } }, { waist: { not: null } }]
      },
      orderBy: { date: 'desc' },
      take: 12,
      select: { date: true, weight: true, bodyFat: true, waist: true }
    }),
    getBloodPanelHistoryForExport(actor, userId, 6)
  ]);

  const metrics = program.metrics.map((metric) => ({
    id: metric.id,
    metricType: metric.metricType,
    label: metricLabel(metric.metricType),
    startValue: n(metric.startValue),
    currentValue: n(metric.currentValue),
    goalValue: n(metric.goalValue),
    unit: metric.unit,
    deltaFromStart: round(n(metric.currentValue) - n(metric.startValue), 2),
    deltaToGoal: round(n(metric.goalValue) - n(metric.currentValue), 2)
  }));

  const latestSnapshot = metricSnapshots[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    client: {
      id: client.id,
      name: `${client.firstName} ${client.lastName}`.trim(),
      email: client.email
    },
    program: {
      id: program.id,
      name: program.name,
      status: program.status,
      startDate: program.startDate.toISOString().slice(0, 10),
      targetEndDate: program.targetEndDate?.toISOString().slice(0, 10) ?? null
    },
    metrics,
    latestSnapshot: latestSnapshot
      ? {
          id: latestSnapshot.id,
          date: latestSnapshot.date.toISOString().slice(0, 10),
          values: latestSnapshot.values.map((value) => ({
            metricType: value.metricType,
            label: metricLabel(value.metricType),
            currentValue: n(value.currentValue),
            unit: value.unit
          }))
        }
      : null,
    metricSnapshots: metricSnapshots.map((snapshot) => ({
      id: snapshot.id,
      date: snapshot.date.toISOString().slice(0, 10),
      values: snapshot.values.map((value) => ({
        metricType: value.metricType,
        label: metricLabel(value.metricType),
        currentValue: n(value.currentValue),
        unit: value.unit
      }))
    })),
    progressPhotos: progressPhotos.map((photoSet) => ({
      id: photoSet.id,
      date: photoSet.date.toISOString().slice(0, 10),
      frontUrl: photoSet.frontUrl,
      sideUrl: photoSet.sideUrl,
      backUrl: photoSet.backUrl,
      photoCount: [photoSet.frontUrl, photoSet.sideUrl, photoSet.backUrl].filter(Boolean).length
    })),
    weightTrend: weightLogs
      .slice()
      .reverse()
      .map((log) => ({
        date: log.date.toISOString().slice(0, 10),
        weight: n(log.weight)
      })),
    bodyCompositionTrend: bodyCompositionLogs
      .slice()
      .reverse()
      .map((log) => ({
        date: log.date.toISOString().slice(0, 10),
        weight: log.weight != null ? n(log.weight) : null,
        bodyFat: log.bodyFat != null ? n(log.bodyFat) : null,
        waist: log.waist != null ? n(log.waist) : null
      })),
    bloodPanels
  };
}

export async function getActiveProgressSummaryForUser(actor: Actor, userId?: string) {
  const targetUserId = userId ?? actor.id;

  const program = await prisma.program.findFirst({
    where: { userId: targetUserId, status: ProgramStatus.ACTIVE },
    select: { id: true, userId: true, coachId: true }
  });
  if (!program) throw new Error('No active program found');

  if (!(await canAccessProgramClient(actor, program.userId, program.coachId))) {
    throw new Error('Forbidden');
  }

  return getProgressSummary(actor, program.id);
}
