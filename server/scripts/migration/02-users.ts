import { PrismaClient, Role, UserStatus } from '@prisma/client';
import { DUMP_PATH, SKIP_FIREBASE, legacyUid } from './config.js';
import { loadIdMap, saveIdMap } from './idmap.js';
import { isValidEmail, parseTable, splitName, type LegacyRow } from './mysqlDumpParser.js';

const prisma = new PrismaClient();

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$.{53}$/;

interface PreparedUser {
  legacyId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  gender: string | null;
  role: Role;
  status: UserStatus;
  notes: string | null;
  ownerId: string | null;
  passwordHash: string | null;
}

function foldNotes(row: LegacyRow): string | null {
  const parts: string[] = [];
  const add = (label: string, value: string | null | undefined) => {
    const v = (value ?? '').trim();
    if (v) parts.push(`${label}: ${v}`);
  };
  add('Height', row.height);
  add('Target body fat', row.target_bf);
  add('Target measurement', row.target_mg);
  add('Medical conditions', row.med_cond);
  add('Exercise conditions', row.exer_cond);
  add('Food conditions', row.food_cond);
  add('Diet notes', row.diet_cond);
  add('Coach notes', row.notes);
  return parts.length ? parts.join('\n') : null;
}

function mapRole(role: string | null): Role {
  const r = (role ?? '').trim().toLowerCase();
  if (r === 'trainer') return Role.COACH;
  if (r === 'admin' || r === 'owner') return Role.ADMIN;
  return Role.USER;
}

function mapStatus(status: string | null): UserStatus {
  const s = (status ?? '').trim().toLowerCase();
  return s === 'active' || s === '' ? UserStatus.ACTIVE : UserStatus.DISABLED;
}

function prepareUsers(): { prepared: PreparedUser[]; skipped: { legacyId: string; email: string | null; reason: string }[] } {
  const rows = parseTable(DUMP_PATH, 'users').sort((a, b) => Number(a.id) - Number(b.id));
  const prepared: PreparedUser[] = [];
  const skipped: { legacyId: string; email: string | null; reason: string }[] = [];
  const seenEmails = new Set<string>();

  for (const row of rows) {
    const legacyId = String(row.id);
    const email = (row.email ?? '').trim().toLowerCase();

    if (!isValidEmail(email)) {
      skipped.push({ legacyId, email: row.email, reason: 'invalid email' });
      continue;
    }
    if (seenEmails.has(email)) {
      skipped.push({ legacyId, email, reason: 'duplicate email' });
      continue;
    }
    seenEmails.add(email);

    const { firstName, lastName } = splitName(row.name);
    const phoneRaw = (row.phone ?? '').replace(/[^\d+]/g, '');
    const hash = (row.password ?? '').trim();

    prepared.push({
      legacyId,
      email,
      firstName,
      lastName,
      phone: phoneRaw || null,
      gender: (row.gender ?? '').trim().toLowerCase() || null,
      role: mapRole(row.role),
      status: mapStatus(row.status),
      notes: foldNotes(row),
      ownerId: row.owner_id && row.owner_id !== '0' ? String(row.owner_id) : null,
      passwordHash: BCRYPT_RE.test(hash) ? hash : null
    });
  }

  return { prepared, skipped };
}

async function importFirebase(users: PreparedUser[]): Promise<{ imported: number; failed: number; noPassword: number }> {
  if (SKIP_FIREBASE) {
    console.log('  Firebase: SKIP_FIREBASE=1, skipping auth import');
    return { imported: 0, failed: 0, noPassword: users.filter((u) => !u.passwordHash).length };
  }

  const { getFirebaseAdmin } = await import('../../src/auth/firebaseAdmin.js');
  const auth = getFirebaseAdmin().auth();

  const records = users.map((u) => {
    const base: {
      uid: string;
      email: string;
      displayName: string;
      passwordHash?: Buffer;
    } = {
      uid: legacyUid(u.legacyId),
      email: u.email,
      displayName: `${u.firstName} ${u.lastName}`.trim()
    };
    if (u.passwordHash) base.passwordHash = Buffer.from(u.passwordHash, 'utf8');
    return base;
  });

  let imported = 0;
  let failed = 0;
  const CHUNK = 1000;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const result = await auth.importUsers(chunk, { hash: { algorithm: 'BCRYPT' } });
    imported += result.successCount;
    failed += result.failureCount;
    for (const err of result.errors) {
      console.warn(`  Firebase import error (uid=${chunk[err.index]?.uid}): ${err.error.message}`);
    }
  }

  return { imported, failed, noPassword: users.filter((u) => !u.passwordHash).length };
}

async function main(): Promise<void> {
  const idMap = loadIdMap();
  const { prepared, skipped } = prepareUsers();

  const coaches = prepared.filter((u) => u.role === Role.COACH || u.role === Role.ADMIN);
  const clients = prepared.filter((u) => u.role === Role.USER);
  console.log(`Phase 2: ${prepared.length} users (${coaches.length} coaches/admins, ${clients.length} clients), ${skipped.length} skipped`);

  const firebase = await importFirebase(prepared);
  console.log(`  Firebase: imported=${firebase.imported} failed=${firebase.failed} withoutPassword=${firebase.noPassword}`);

  // Upsert users (coaches first so coach assignments resolve).
  for (const u of [...coaches, ...clients]) {
    const data = {
      firebaseUid: legacyUid(u.legacyId),
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      gender: u.gender,
      role: u.role,
      status: u.status
    };
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: data,
      update: data
    });
    idMap.users[u.legacyId] = user.id;
    if (u.notes) idMap.notes[u.legacyId] = u.notes;
    if (u.role === Role.COACH || u.role === Role.ADMIN) idMap.coaches[u.legacyId] = user.id;
  }

  // Coach assignments from owner_id.
  let assignments = 0;
  let unresolved = 0;
  for (const u of clients) {
    if (!u.ownerId) continue;
    const coachId = idMap.coaches[u.ownerId];
    const userId = idMap.users[u.legacyId];
    if (!coachId || !userId) {
      unresolved += 1;
      continue;
    }
    await prisma.coachAssignment.upsert({
      where: { userId },
      create: { coachId, userId },
      update: { coachId }
    });
    assignments += 1;
  }
  console.log(`  Coach assignments: ${assignments} (${unresolved} unresolved owner_id)`);

  saveIdMap(idMap);

  if (skipped.length) {
    console.log('  Skipped users:');
    for (const s of skipped.slice(0, 50)) console.log(`    legacy=${s.legacyId} email=${s.email ?? ''} (${s.reason})`);
    if (skipped.length > 50) console.log(`    ... and ${skipped.length - 50} more`);
  }
  console.log('Phase 2 complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
