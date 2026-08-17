/**
 * Mark obvious gym-only catalog exercises from their names.
 * Dumbbell, kettlebell, and band names stay home-friendly.
 *
 *   cd server && npx tsx --env-file=.env scripts/mark-gym-exercises.ts
 *   cd server && npx tsx --env-file=.env scripts/mark-gym-exercises.ts --apply
 */
import { prisma } from '../src/db/prisma.js';
import { nameLooksLikeGymOnly } from '../src/utils/exerciseGymHeuristic.js';

const apply = process.argv.includes('--apply');

async function main() {
  const exercises = await prisma.exercise.findMany({
    select: { id: true, name: true, requiresGym: true },
    orderBy: { name: 'asc' }
  });

  const toMark = exercises.filter((exercise) => !exercise.requiresGym && nameLooksLikeGymOnly(exercise.name));
  const alreadyMarked = exercises.filter((exercise) => exercise.requiresGym).length;

  console.log(
    `Catalog: ${exercises.length} exercises; ${alreadyMarked} already require gym; ${toMark.length} new gym-only matches.`
  );
  for (const exercise of toMark) {
    console.log(`  ${exercise.name}`);
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to set requiresGym.');
    return;
  }

  if (!toMark.length) {
    console.log('Nothing to update.');
    return;
  }

  const result = await prisma.exercise.updateMany({
    where: { id: { in: toMark.map((exercise) => exercise.id) } },
    data: { requiresGym: true }
  });
  console.log(`\nMarked ${result.count} exercises as gym-only.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
