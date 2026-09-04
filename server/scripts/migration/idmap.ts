import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Persisted legacy-id -> new-cuid map so the migration phases can run
 * independently and idempotently.
 */
export interface IdMap {
  /** legacy user id -> new User.id */
  users: Record<string, string>;
  /** legacy user id (role=trainer) -> new coach User.id */
  coaches: Record<string, string>;
  /** legacy user id -> new Program.id */
  programs: Record<string, string>;
  /** legacy food name -> Food.id */
  foods: Record<string, string>;
  /** legacy exercise name -> Exercise.id */
  exercises: Record<string, string>;
  /**
   * legacy user id -> folded medical/exercise/food/diet conditions + coach
   * notes. The current User model has no notes field, so this preserves the
   * legacy free-text without requiring a schema migration.
   */
  notes: Record<string, string>;
}

const DEFAULT_MAP: IdMap = { users: {}, coaches: {}, programs: {}, foods: {}, exercises: {}, notes: {} };

export const IDMAP_PATH = process.env.MIGRATION_IDMAP_PATH
  ? resolve(process.env.MIGRATION_IDMAP_PATH)
  : resolve(process.cwd(), '.tmp', 'migration-idmap.json');

export function loadIdMap(path: string = IDMAP_PATH): IdMap {
  if (!existsSync(path)) return structuredClone(DEFAULT_MAP);
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<IdMap>;
    return { ...structuredClone(DEFAULT_MAP), ...parsed };
  } catch {
    return structuredClone(DEFAULT_MAP);
  }
}

export function saveIdMap(map: IdMap, path: string = IDMAP_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(map, null, 2), 'utf8');
}
