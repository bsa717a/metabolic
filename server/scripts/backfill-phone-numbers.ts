/**
 * Normalize stored user phone numbers to E.164 (US +1 for 10-digit numbers).
 *
 *   cd server && npx tsx --env-file=.env scripts/backfill-phone-numbers.ts
 *   cd server && npx tsx --env-file=.env scripts/backfill-phone-numbers.ts --apply
 */
import { prisma } from '../src/db/prisma.js';
import { normalizePhone } from '../src/utils/phone.js';

const apply = process.argv.includes('--apply');

async function main() {
  const users = await prisma.user.findMany({
    where: { phone: { not: null } },
    select: { id: true, email: true, firstName: true, lastName: true, phone: true },
    orderBy: { email: 'asc' }
  });

  const changes = users.flatMap((user) => {
    const current = user.phone!.trim();
    const next = normalizePhone(current);
    if (current === next) return [];
    return [{ ...user, current, next }];
  });

  console.log(`Found ${users.length} users with phone numbers; ${changes.length} need updates.`);
  for (const row of changes) {
    console.log(`${row.email}: ${row.current} -> ${row.next}`);
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write changes.');
    return;
  }

  if (!changes.length) {
    console.log('Nothing to update.');
    return;
  }

  let updated = 0;
  for (const row of changes) {
    await prisma.user.update({ where: { id: row.id }, data: { phone: row.next } });
    updated += 1;
  }
  console.log(`\nUpdated ${updated} user phone numbers.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
