import { PrismaClient, Role, UserStatus } from '@prisma/client';
import { DUMP_PATH, SKIP_FIREBASE, legacyUid } from './config.js';
import { loadIdMap, saveIdMap } from './idmap.js';
import { cleanText, isValidEmail, parseHeightInches, parseTable, splitName, num, type LegacyRow } from './mysqlDumpParser.js';

const prisma = new PrismaClient();

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$.{53}$/;

interface PreparedProfile {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  medicalConditions: string | null;
  exerciseConditions: string | null;
  foodConditions: string | null;
  dietNotes: string | null;
  coachNotes: string | null;
  heightInches: number | null;
  heightRaw: string | null;
  targetBodyFat: number | null;
  targetMeasurement: number | null;
}

interface PreparedUser {
  legacyId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  gender: string | null;
  role: Role;
  status: UserStatus;
  profile: PreparedProfile;
  ownerId: string | null;
  passwordHash: string | null;
}

function prepareProfile(row: LegacyRow): PreparedProfile {
  return {
    addressLine1: cleanText(row.addr_line_1),
    addressLine2: cleanText(row.addr_line_2),
    city: cleanText(row.city),
    state: cleanText(row.state),
    zip: cleanText(row.zip),
    emergencyContactName: cleanText(row.ec_name),
    emergencyContactPhone: cleanText(row.ec_phone),
    emergencyContactRelationship: cleanText(row.ec_relationship),
    medicalConditions: cleanText(row.med_cond),
    exerciseConditions: cleanText(row.exer_cond),
    foodConditions: cleanText(row.food_cond),
    dietNotes: cleanText(row.diet_cond),
    coachNotes: cleanText(row.notes),
    heightInches: parseHeightInches(row.height),
    heightRaw: cleanText(row.height),
    targetBodyFat: num(cleanText(row.target_bf)),
    targetMeasurement: num(cleanText(row.target_mg))
  };
}

/** True when the profile has at least one populated field worth persisting. */
function hasProfileData(profile: PreparedProfile): boolean {
  return Object.values(profile).some((v) => v !== null);
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
      profile: prepareProfile(row),
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
  let profilesUpserted = 0;
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
    if (u.role === Role.COACH || u.role === Role.ADMIN) idMap.coaches[u.legacyId] = user.id;

    if (hasProfileData(u.profile)) {
      await prisma.clientProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...u.profile },
        update: u.profile
      });
      profilesUpserted += 1;
    }
  }
  console.log(`  Client profiles: ${profilesUpserted}`);

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
