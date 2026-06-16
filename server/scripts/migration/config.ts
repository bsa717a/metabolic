import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

// Load env (DATABASE_URL etc.) before any PrismaClient is constructed.
for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'server/.env')]) {
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: true });
    break;
  }
}

/** Path to the legacy MySQL dump. Override with LEGACY_DUMP_PATH. */
export const DUMP_PATH = process.env.LEGACY_DUMP_PATH
  ? resolve(process.env.LEGACY_DUMP_PATH)
  : '/Users/derekfowler/repo/mmv1/mmv1/astermet_app.sql';

/** Deterministic Firebase UID / linkage key for a legacy user id. */
export function legacyUid(legacyId: string | number): string {
  return `legacy-${legacyId}`;
}

/** Set SKIP_FIREBASE=1 to migrate Postgres only (no Firebase Auth writes). */
export const SKIP_FIREBASE = process.env.SKIP_FIREBASE === '1';
