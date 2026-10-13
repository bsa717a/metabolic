import { importedPlanTitle } from '../../src/utils/importedPlanTitle.ts';

/**
 * Pure helpers for the one-or-many legacy user import.
 * Program rows in the old app store the training session id in `owner_id`
 * (`TrainingSession` hasOne nutrition/exercise program on that column).
 * A matching user id is a coincidence, not a second owner.
 */

export interface ImportArgs {
  apply: boolean;
  force: boolean;
  authOnly: boolean;
  emails: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseImportArgs(argv: string[]): ImportArgs {
  const emails: string[] = [];
  let apply = false;
  let force = false;
  let authOnly = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') apply = true;
    else if (arg === '--force') force = true;
    else if (arg === '--auth-only') authOnly = true;
    else if (arg === '--email') {
      const raw = argv[i + 1] ?? '';
      i += 1;
      if (!raw.trim() || raw.startsWith('--')) {
        throw new Error('Pass --email user@example.com');
      }
      for (const part of raw.split(',')) {
        const email = part.trim().toLowerCase();
        if (!email) continue;
        if (!EMAIL_RE.test(email)) throw new Error(`Invalid email: ${part.trim()}`);
        if (!emails.includes(email)) emails.push(email);
      }
    }
  }

  if (emails.length === 0) {
    throw new Error('Pass --email user@example.com (repeat --email for more than one user)');
  }
  return { apply, force, authOnly, emails };
}

export function accountAction(emailAlreadyExists: boolean): 'create' | 'refresh' {
  return emailAlreadyExists ? 'refresh' : 'create';
}

/**
 * Imported plan title. `displayName` stays in the signature so
 * `import-one-legacy-user.ts` on feature/import-many-legacy-users still compiles.
 * The title itself no longer includes the client name.
 */
export function currentPlanTitle(displayName: string, kind: 'meals' | 'workouts', dateLabel: string): string {
  void displayName;
  return importedPlanTitle(kind, dateLabel);
}

export function displayNameFromLegacy(name: string | null | undefined, email: string): string {
  const cleaned = (name ?? '').trim().replace(/\s+/g, ' ');
  return cleaned || email;
}

/** Every session for the user. Dates and session numbers are kept as stored. */
export function sessionsForUser<T extends { ownerId: string }>(rows: T[], userId: string): T[] {
  return rows.filter((row) => row.ownerId === userId);
}

/** Programs whose owner_id is one of this user's training session ids. */
export function programsForSessions<T extends { ownerId: string }>(programs: T[], sessionIds: ReadonlySet<string>): T[] {
  return programs.filter((program) => sessionIds.has(program.ownerId));
}

export interface ForeignProgram {
  kind: 'nutrition' | 'exercise';
  id: string;
  date: string;
  ownerId: string;
  sessionOwnerUserId: string;
}

/**
 * A program whose owner_id equals this user id, but that id is another
 * client's training session. Leave it on that session.
 */
export function foreignSessionPrograms(input: {
  userId: string;
  ownSessionIds: ReadonlySet<string>;
  candidates: { kind: 'nutrition' | 'exercise'; id: string; date: string; ownerId: string }[];
  sessionOwnerById: ReadonlyMap<string, string>;
}): ForeignProgram[] {
  const notes: ForeignProgram[] = [];
  for (const program of input.candidates) {
    if (program.ownerId !== input.userId) continue;
    if (input.ownSessionIds.has(program.ownerId)) continue;
    const sessionOwnerUserId = input.sessionOwnerById.get(program.ownerId);
    if (!sessionOwnerUserId || sessionOwnerUserId === input.userId) continue;
    notes.push({
      kind: program.kind,
      id: program.id,
      date: program.date,
      ownerId: program.ownerId,
      sessionOwnerUserId
    });
  }
  return notes;
}
