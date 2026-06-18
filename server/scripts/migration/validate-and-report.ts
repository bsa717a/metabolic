import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { DUMP_PATH, SKIP_FIREBASE } from './config.js';
import { isValidEmail, parseTable } from './mysqlDumpParser.js';

const prisma = new PrismaClient();
const REPORT_PATH = resolve(process.cwd(), '.tmp', 'migration-report.md');

const SPOTCHECK_EMAIL = 'erickmchenry@gmail.com';

function countValidUsers(): { clients: number; coaches: number; invalid: number; duplicate: number } {
  const rows = parseTable(DUMP_PATH, 'users').sort((a, b) => Number(a.id) - Number(b.id));
  const seen = new Set<string>();
  let clients = 0;
  let coaches = 0;
  let invalid = 0;
  let duplicate = 0;
  for (const row of rows) {
    const email = (row.email ?? '').trim().toLowerCase();
    if (!isValidEmail(email)) {
      invalid += 1;
      continue;
    }
    if (seen.has(email)) {
      duplicate += 1;
      continue;
    }
    seen.add(email);
    const role = (row.role ?? '').toLowerCase();
    if (role === 'trainer' || role === 'admin' || role === 'owner') coaches += 1;
    else clients += 1;
  }
  return { clients, coaches, invalid, duplicate };
}

async function main(): Promise<void> {
  const legacyFoods = parseTable(DUMP_PATH, 'nutritions').filter((r) => (r.name ?? '').trim()).length;
  const legacyExercises = parseTable(DUMP_PATH, 'exercises').filter((r) => (r.name ?? '').trim()).length;
  const legacyNutritionTemplates = parseTable(DUMP_PATH, 'nutritionTemplate').filter((r) => (r.name ?? '').trim()).length;
  const legacyExerciseTemplates =
    parseTable(DUMP_PATH, 'exerciseTemplate').filter((r) => (r.name ?? '').trim()).length +
    parseTable(DUMP_PATH, 'circuits').filter((r) => (r.name ?? '').trim()).length;
  const legacyUsers = countValidUsers();
  const legacySessions = parseTable(DUMP_PATH, 'training_sessions').length;

  const [
    foods,
    exercises,
    nutritionTemplates,
    exerciseTemplates,
    users,
    coaches,
    assignments,
    programs,
    metricSnapshots,
    progressSnapshots,
    profiles,
    profilesWithHeight,
    profilesWithConditions
  ] = await Promise.all([
    prisma.food.count({ where: { source: 'IMPORTED' } }),
    prisma.exercise.count(),
    prisma.nutritionPlanTemplate.count({ where: { visibility: 'GLOBAL' } }),
    prisma.exerciseTemplate.count({ where: { visibility: 'GLOBAL' } }),
    prisma.user.count({ where: { firebaseUid: { startsWith: 'legacy-' } } }),
    prisma.user.count({ where: { firebaseUid: { startsWith: 'legacy-' }, role: { in: ['COACH', 'ADMIN'] } } }),
    prisma.coachAssignment.count(),
    prisma.program.count({ where: { name: 'Legacy Program' } }),
    prisma.programMetricSnapshot.count(),
    prisma.progressSnapshot.count({ where: { notes: { startsWith: 'legacy:' } } }),
    prisma.clientProfile.count(),
    prisma.clientProfile.count({ where: { heightInches: { not: null } } }),
    prisma.clientProfile.count({
      where: {
        OR: [
          { medicalConditions: { not: null } },
          { exerciseConditions: { not: null } },
          { foodConditions: { not: null } },
          { dietNotes: { not: null } }
        ]
      }
    })
  ]);

  const spot = await prisma.user.findUnique({
    where: { email: SPOTCHECK_EMAIL },
    include: {
      programs: { include: { metrics: true, metricSnapshots: true } },
      progressSnapshots: true,
      userAssignments: { include: { coach: true } },
      clientProfile: true
    }
  });

  const row = (label: string, legacy: number | string, migrated: number | string) =>
    `| ${label} | ${legacy} | ${migrated} |`;

  const spotLines = spot
    ? [
        `- User: ${spot.firstName} ${spot.lastName} (${spot.email}), role ${spot.role}, firebaseUid \`${spot.firebaseUid}\``,
        `- Coach: ${spot.userAssignments[0]?.coach ? `${spot.userAssignments[0].coach.firstName} ${spot.userAssignments[0].coach.lastName}` : 'none'}`,
        `- Programs: ${spot.programs.length}`,
        `- Program metrics: ${spot.programs[0]?.metrics.length ?? 0}`,
        `- Metric snapshots: ${spot.programs[0]?.metricSnapshots.length ?? 0}`,
        `- Progress snapshots: ${spot.progressSnapshots.length}`,
        `- Profile height: ${spot.clientProfile?.heightInches != null ? `${spot.clientProfile.heightInches} in (raw: ${spot.clientProfile.heightRaw ?? 'n/a'})` : 'none'}`,
        `- Profile address: ${spot.clientProfile?.city || spot.clientProfile?.state ? `${spot.clientProfile?.city ?? ''} ${spot.clientProfile?.state ?? ''}`.trim() : 'none'}`
      ]
    : [`- Spot-check user ${SPOTCHECK_EMAIL} not found.`];

  const report = `# Legacy Data Migration Report

Generated: ${new Date().toISOString()}
Source dump: \`${DUMP_PATH}\`
Firebase auth import: ${SKIP_FIREBASE ? 'SKIPPED (SKIP_FIREBASE=1)' : 'enabled'}

## Counts (legacy vs migrated)

| Entity | Legacy | Migrated |
| --- | --- | --- |
${row('Foods', legacyFoods, foods)}
${row('Exercises', legacyExercises, exercises)}
${row('Nutrition templates', legacyNutritionTemplates, nutritionTemplates)}
${row('Exercise templates', legacyExerciseTemplates, exerciseTemplates)}
${row('Users (clients)', legacyUsers.clients, users - coaches)}
${row('Users (coaches/admins)', legacyUsers.coaches, coaches)}
${row('Coach assignments', '-', assignments)}
${row('Programs', '-', programs)}
${row('Metric snapshots (<= sessions)', legacySessions, metricSnapshots)}
${row('Progress snapshots', '-', progressSnapshots)}
${row('Client profiles', '-', profiles)}
${row('Profiles with height', '-', profilesWithHeight)}
${row('Profiles with conditions', '-', profilesWithConditions)}

Skipped users: ${legacyUsers.invalid} invalid email, ${legacyUsers.duplicate} duplicate email.

## Spot check: ${SPOTCHECK_EMAIL}

${spotLines.join('\n')}

## Notes

- Metric snapshots are de-duplicated to one per calendar day, so the count is <= raw legacy training_sessions (${legacySessions}).
- Out-of-scope (Core migration): legacy nutritionPrograms / exercisePrograms daily history.
`;

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, report, 'utf8');

  console.log(report);
  console.log(`Report written to ${REPORT_PATH}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
