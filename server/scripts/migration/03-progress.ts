import { MetricType, PrismaClient, ProgramStatus } from '@prisma/client';
import { DUMP_PATH } from './config.js';
import { loadIdMap, saveIdMap } from './idmap.js';
import { numPositive, parseLegacyDate, parseTable, parseTimestamp, type LegacyRow } from './mysqlDumpParser.js';

const prisma = new PrismaClient();

interface SessionMetrics {
  date: Date;
  sessionNumber: number;
  weight: number | null;
  bodyFat: number | null;
  waist: number | null;
  hips: number | null;
  chest: number | null;
  neck: number | null;
  arm: number | null;
  bicep: number | null;
  thigh: number | null;
  calf: number | null;
  forearm: number | null;
  fatMass: number | null;
  leanMass: number | null;
}

function toMetrics(row: LegacyRow): SessionMetrics | null {
  const date = parseLegacyDate(row.date) ?? (() => {
    const ts = parseTimestamp(row.created_at);
    return ts ? new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate())) : null;
  })();
  if (!date) return null;

  const weight = numPositive(row.weight);
  const bodyFat = numPositive(row.body_fat);
  const fatMass = weight !== null && bodyFat !== null ? Math.round(weight * (bodyFat / 100) * 100) / 100 : null;
  const leanMass = weight !== null && fatMass !== null ? Math.round((weight - fatMass) * 100) / 100 : null;

  return {
    date,
    sessionNumber: Number(row.session_number) || 0,
    weight,
    bodyFat,
    waist: numPositive(row.waist),
    hips: numPositive(row.hips),
    chest: numPositive(row.chest),
    neck: numPositive(row.neck),
    arm: numPositive(row.arm),
    bicep: numPositive(row.bicep),
    thigh: numPositive(row.thigh),
    calf: numPositive(row.calf),
    forearm: numPositive(row.forearm),
    fatMass,
    leanMass
  };
}

const ENUM_METRICS: { type: MetricType; unit: string; pick: (m: SessionMetrics) => number | null }[] = [
  { type: MetricType.WEIGHT, unit: 'lbs', pick: (m) => m.weight },
  { type: MetricType.BODY_FAT, unit: '%', pick: (m) => m.bodyFat },
  { type: MetricType.WAIST, unit: 'in', pick: (m) => m.waist },
  { type: MetricType.HIPS, unit: 'in', pick: (m) => m.hips },
  { type: MetricType.CHEST, unit: 'in', pick: (m) => m.chest },
  { type: MetricType.FAT_MASS, unit: 'lbs', pick: (m) => m.fatMass },
  { type: MetricType.LEAN_TISSUE_MASS, unit: 'lbs', pick: (m) => m.leanMass }
];

/** Keep one session per calendar day (the one with the highest session number). */
function dedupeByDay(sessions: SessionMetrics[]): SessionMetrics[] {
  const byDay = new Map<string, SessionMetrics>();
  for (const s of sessions) {
    const key = s.date.toISOString().slice(0, 10);
    const existing = byDay.get(key);
    if (!existing || s.sessionNumber >= existing.sessionNumber) byDay.set(key, s);
  }
  return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

function firstNonNull(sessions: SessionMetrics[], pick: (m: SessionMetrics) => number | null): number | null {
  for (const s of sessions) {
    const v = pick(s);
    if (v !== null) return v;
  }
  return null;
}

function lastNonNull(sessions: SessionMetrics[], pick: (m: SessionMetrics) => number | null): number | null {
  for (let i = sessions.length - 1; i >= 0; i -= 1) {
    const v = pick(sessions[i]);
    if (v !== null) return v;
  }
  return null;
}

async function main(): Promise<void> {
  const idMap = loadIdMap();

  // Per-client target body fat (for BODY_FAT goal).
  const targetBf = new Map<string, number | null>();
  for (const row of parseTable(DUMP_PATH, 'users')) {
    targetBf.set(String(row.id), numPositive(row.target_bf));
  }

  // Group sessions by legacy client id (owner_id).
  const sessionsByClient = new Map<string, SessionMetrics[]>();
  for (const row of parseTable(DUMP_PATH, 'training_sessions')) {
    const ownerId = String(row.owner_id);
    const metrics = toMetrics(row);
    if (!metrics) continue;
    const list = sessionsByClient.get(ownerId) ?? [];
    list.push(metrics);
    sessionsByClient.set(ownerId, list);
  }

  let programs = 0;
  let snapshots = 0;
  let progressSnapshots = 0;
  let skippedNoUser = 0;

  for (const [legacyClientId, rawSessions] of sessionsByClient) {
    const userId = idMap.users[legacyClientId];
    if (!userId) {
      skippedNoUser += 1;
      continue;
    }

    const sessions = dedupeByDay(rawSessions);
    if (sessions.length === 0) continue;

    const coachAssignment = await prisma.coachAssignment.findUnique({ where: { userId } });
    const startDate = sessions[0].date;

    // Program (idempotent via idmap or natural lookup).
    let programId = idMap.programs[legacyClientId];
    if (programId) {
      const exists = await prisma.program.findUnique({ where: { id: programId } });
      if (!exists) programId = undefined as unknown as string;
    }
    if (!programId) {
      const existing = await prisma.program.findFirst({ where: { userId, name: 'Legacy Program' } });
      const program = existing
        ? await prisma.program.update({ where: { id: existing.id }, data: { startDate, coachId: coachAssignment?.coachId ?? null } })
        : await prisma.program.create({
            data: {
              userId,
              name: 'Legacy Program',
              status: ProgramStatus.ACTIVE,
              startDate,
              coachId: coachAssignment?.coachId ?? null
            }
          });
      programId = program.id;
    } else {
      await prisma.program.update({ where: { id: programId }, data: { startDate, coachId: coachAssignment?.coachId ?? null } });
    }
    idMap.programs[legacyClientId] = programId;
    programs += 1;

    // Program metrics: start = first known, current = latest known, goal best-effort.
    for (const def of ENUM_METRICS) {
      const start = firstNonNull(sessions, def.pick);
      if (start === null) continue;
      const current = lastNonNull(sessions, def.pick) ?? start;
      let goal = current;
      if (def.type === MetricType.BODY_FAT) {
        const tgt = targetBf.get(legacyClientId);
        if (tgt !== null && tgt !== undefined) goal = tgt;
      }
      await prisma.programMetric.upsert({
        where: { programId_metricType: { programId, metricType: def.type } },
        create: { programId, metricType: def.type, startValue: start, currentValue: current, goalValue: goal, unit: def.unit },
        update: { startValue: start, currentValue: current, goalValue: goal, unit: def.unit }
      });
    }

    // Metric snapshots per session day.
    for (const s of sessions) {
      const values = ENUM_METRICS
        .map((def) => ({ metricType: def.type, currentValue: def.pick(s), unit: def.unit }))
        .filter((v): v is { metricType: MetricType; currentValue: number; unit: string } => v.currentValue !== null);
      if (values.length === 0) continue;

      const snapshot = await prisma.programMetricSnapshot.upsert({
        where: { programId_date: { programId, date: s.date } },
        create: { programId, date: s.date },
        update: {}
      });
      await prisma.programMetricSnapshotValue.deleteMany({ where: { snapshotId: snapshot.id } });
      await prisma.programMetricSnapshotValue.createMany({
        data: values.map((v) => ({ snapshotId: snapshot.id, metricType: v.metricType, currentValue: v.currentValue, unit: v.unit }))
      });
      snapshots += 1;
    }

    // Progress snapshots preserve every circumference for full fidelity.
    await prisma.progressSnapshot.deleteMany({ where: { userId, notes: { startsWith: 'legacy:' } } });
    for (const s of sessions) {
      const measurements: Record<string, number> = {};
      const addMeasurement = (key: string, value: number | null) => {
        if (value !== null) measurements[key] = value;
      };
      addMeasurement('bodyFat', s.bodyFat);
      addMeasurement('waist', s.waist);
      addMeasurement('hips', s.hips);
      addMeasurement('chest', s.chest);
      addMeasurement('neck', s.neck);
      addMeasurement('arm', s.arm);
      addMeasurement('bicep', s.bicep);
      addMeasurement('thigh', s.thigh);
      addMeasurement('calf', s.calf);
      addMeasurement('forearm', s.forearm);
      if (s.weight === null && Object.keys(measurements).length === 0) continue;

      await prisma.progressSnapshot.create({
        data: {
          userId,
          programId,
          snapshotDate: s.date,
          weight: s.weight,
          measurements: Object.keys(measurements).length ? measurements : undefined,
          completionStatus: 'COMPLETE',
          completedAt: s.date,
          notes: `legacy:session`
        }
      });
      progressSnapshots += 1;
    }
  }

  saveIdMap(idMap);
  console.log('Phase 3: body-composition progress history');
  console.log(`  Programs: ${programs}`);
  console.log(`  Metric snapshots: ${snapshots}`);
  console.log(`  Progress snapshots: ${progressSnapshots}`);
  console.log(`  Sessions skipped (no migrated user): ${skippedNoUser}`);
  console.log('Phase 3 complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
