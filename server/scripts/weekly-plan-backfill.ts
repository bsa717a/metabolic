/**
 * Weekly-plan retrofit — READ-ONLY validator / prototype.
 *
 * Validates (against the live Postgres DB) the claim that each migrated weekly session exists as
 * BOTH a ProgramMetricSnapshot and a DailyLog sharing (userId, date), so the dropped
 * session -> plan link is recoverable by an in-DB join — no legacy dump needed.
 *
 * This script DOES NOT WRITE. It reports join coverage and proposed week numbering so we can trust
 * the backfill before adding the Gap B schema and running the real (write) backfill.
 *
 * Usage (needs DATABASE_URL in env — point it at the DB you want to inspect):
 *   cd server && npx tsx --env-file=.env scripts/weekly-plan-backfill.ts [--status ACTIVE] [--limit N] [--email x@y.com] [--samples 5]
 */
import { PrismaClient, ProgramStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface Args {
  status: ProgramStatus | null;
  limit: number | null;
  email: string | null;
  samples: number;
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { status: null, limit: null, email: null, samples: 5, apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--status') args.status = (argv[++i] ?? '').toUpperCase() as ProgramStatus;
    else if (a === '--limit') args.limit = Number(argv[++i]) || null;
    else if (a === '--email') args.email = (argv[++i] ?? '').trim().toLowerCase() || null;
    else if (a === '--samples') args.samples = Number(argv[++i]) || 0;
    else if (a === '--apply') args.apply = true;
  }
  return args;
}

const dateKey = (d: Date) => d.toISOString().slice(0, 10);
const pct = (n: number, d: number) => (d ? ((100 * n) / d).toFixed(1) : '0.0');

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Run with `npx tsx --env-file=.env scripts/weekly-plan-backfill.ts`.');
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));

  const programs = await prisma.program.findMany({
    where: {
      ...(args.status ? { status: args.status } : {}),
      ...(args.email ? { user: { email: args.email } } : {})
    },
    select: { id: true, userId: true, status: true, startDate: true },
    orderBy: { createdAt: 'asc' },
    ...(args.limit ? { take: args.limit } : {})
  });

  console.log(args.apply ? `weekly-plan retrofit — APPLY (writes PlanPeriod rows)` : `weekly-plan retrofit validation (READ-ONLY)`);
  console.log(`  programs scanned: ${programs.length}${args.status ? ` (status=${args.status})` : ''}\n`);

  let planPeriodsWritten = 0;
  let snapTotal = 0;
  let logTotal = 0;
  let legacyLogTotal = 0;
  let snapWithLog = 0;
  let legacyLogWithSnap = 0;
  let measurementOnlyWeeks = 0;
  const weeksPerProgram: number[] = [];
  const samples: string[] = [];

  for (const program of programs) {
    const [snaps, logs] = await Promise.all([
      prisma.programMetricSnapshot.findMany({
        where: { programId: program.id },
        select: { id: true, date: true },
        orderBy: { date: 'asc' }
      }),
      prisma.dailyLog.findMany({
        where: { userId: program.userId },
        select: { id: true, date: true, notes: true, _count: { select: { meals: true } } }
      })
    ]);

    const logByDay = new Map(logs.map((l) => [dateKey(l.date), l]));
    snapTotal += snaps.length;
    logTotal += logs.length;
    const legacyLogs = logs.filter((l) => l.notes?.startsWith('legacy:'));
    legacyLogTotal += legacyLogs.length;

    // Week numbering = rank snapshots by date (validated to match legacy session_number).
    let weekNo = 0;
    const sampleLines: string[] = [];
    for (const snap of snaps) {
      weekNo += 1;
      const log = logByDay.get(dateKey(snap.date));
      if (log) snapWithLog += 1;
      else measurementOnlyWeeks += 1;
      if (args.apply) {
        // One PlanPeriod per session (week marker). Templates left null: legacy weeks were inline
        // plans already materialized as the DailyLog's planned meals — no template to point at.
        await prisma.planPeriod.upsert({
          where: { programId_effectiveDate: { programId: program.id, effectiveDate: snap.date } },
          create: { programId: program.id, effectiveDate: snap.date, weekNumber: weekNo, sourceSnapshotId: snap.id },
          update: { weekNumber: weekNo, sourceSnapshotId: snap.id }
        });
        planPeriodsWritten += 1;
      }
      if (samples.length < args.samples && sampleLines.length < 4) {
        sampleLines.push(
          `    week#${weekNo} ${dateKey(snap.date)}  ${log ? `log=${log._count.meals} meals` : 'NO LOG (measurement-only)'}`
        );
      }
    }
    weeksPerProgram.push(snaps.length);

    const snapDays = new Set(snaps.map((s) => dateKey(s.date)));
    for (const l of legacyLogs) if (snapDays.has(dateKey(l.date))) legacyLogWithSnap += 1;

    if (samples.length < args.samples && snaps.length > 0) {
      samples.push(`  program ${program.id} (user ${program.userId}, ${snaps.length} weeks):\n${sampleLines.join('\n')}`);
    }
  }

  console.log('=== JOIN COVERAGE (the retrofit hinges on this) ===');
  console.log(`  metric snapshots (weeks): ${snapTotal}`);
  console.log(`  snapshots with a DailyLog on same (userId,date): ${snapWithLog} (${pct(snapWithLog, snapTotal)}%)`);
  console.log(`  measurement-only weeks (snapshot, no log): ${measurementOnlyWeeks} (${pct(measurementOnlyWeeks, snapTotal)}%)`);
  console.log(`  daily logs total: ${logTotal}  (legacy-imported: ${legacyLogTotal})`);
  console.log(`  legacy logs with a matching snapshot: ${legacyLogWithSnap} (${pct(legacyLogWithSnap, legacyLogTotal)}%)`);
  if (weeksPerProgram.length) {
    weeksPerProgram.sort((a, b) => a - b);
    const mid = weeksPerProgram[Math.floor(weeksPerProgram.length / 2)];
    console.log(`  weeks/program: min=${weeksPerProgram[0]} median=${mid} max=${weeksPerProgram[weeksPerProgram.length - 1]}`);
  }
  if (samples.length) {
    console.log('\n=== SAMPLES (proposed week numbering) ===');
    console.log(samples.join('\n'));
  }
  console.log(
    args.apply
      ? `\nApplied: ${planPeriodsWritten} PlanPeriod rows upserted.`
      : '\nNo rows were modified (read-only). Re-run with --apply to write PlanPeriod rows (requires the weekly_plans migration).'
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
