export type ImportedPlanKind = 'meals' | 'workouts';

/** Description prefix written by the legacy importer for a nutrition template. */
export const IMPORTED_NUTRITION_TAG_PREFIX = 'mmv1:nutritionProgram:';

/** Description prefix written by the legacy importer for an exercise plan. */
export const IMPORTED_EXERCISE_TAG_PREFIX = 'mmv1:exerciseProgram:';

/**
 * "{Client Name} current meals (YYYY-MM-DD)" or the workouts kind.
 * The client name is required, so an already-renamed "Current meals (…)" does not match.
 */
const IMPORTED_PLAN_TITLE =
  /^(?<client>.+) current (?<kind>meals|workouts) \((?<date>\d{4}-\d{2}-\d{2})\)$/;

/** Title for a newly imported plan. The client name is not included. */
export function importedPlanTitle(kind: ImportedPlanKind, dateLabel: string): string {
  const date = dateLabel.trim() || 'undated';
  return `Current ${kind} (${date})`;
}

/**
 * New title when `name` is an imported "{client} current {kind} (YYYY-MM-DD)" row.
 * Null for library plans, hand-named templates, and titles that are already renamed.
 */
export function renameImportedPlanTitle(name: string): string | null {
  const match = IMPORTED_PLAN_TITLE.exec(name.trim());
  const kind = match?.groups?.kind;
  const date = match?.groups?.date;
  if ((kind !== 'meals' && kind !== 'workouts') || !date) return null;
  return importedPlanTitle(kind, date);
}
