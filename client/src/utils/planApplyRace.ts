export type WeekAssignment = {
  weekday: number;
  templateId: string | null;
};

export function weekAssignmentsEqual(
  left: readonly WeekAssignment[],
  right: readonly WeekAssignment[]
): boolean {
  if (left.length !== right.length) return false;
  const rightByWeekday = new Map(right.map((day) => [day.weekday, day.templateId ?? null]));
  return left.every((day) => (rightByWeekday.get(day.weekday) ?? null) === (day.templateId ?? null));
}

/**
 * A routine row has to exist before a weekday add, so an unsaved empty week
 * still needs a persist. After that, only template changes need another PUT.
 */
export function weekAssignmentsNeedSave(
  assignments: readonly WeekAssignment[],
  savedDays: readonly WeekAssignment[]
): boolean {
  if (savedDays.length === 0) return true;
  return !weekAssignmentsEqual(assignments, savedDays);
}

/**
 * What the editor should display when a plan-apply request settles.
 *
 * Weekday swaps made while the request was in flight always win. Otherwise a
 * failure restores the week from before the pick, and a success adopts the
 * server week.
 */
export function assignmentsAfterPlanApply<T extends WeekAssignment>(input: {
  succeeded: boolean;
  sent: readonly T[];
  local: readonly T[];
  previous: readonly T[];
  server: readonly T[];
}): T[] {
  if (!weekAssignmentsEqual(input.sent, input.local)) return [...input.local];
  return input.succeeded ? [...input.server] : [...input.previous];
}

/**
 * Whether a waiting add/remove should PUT after a plan apply settles.
 * A failed apply is not written again. In-flight weekday edits stay on screen
 * until an explicit save. If the routine row does not exist yet, the previous
 * week is created so the add still has somewhere to land.
 */
export function shouldPersistAfterPlanApply(input: {
  succeeded: boolean;
  settled: readonly WeekAssignment[];
  previous: readonly WeekAssignment[];
  assignmentsNeedSave: boolean;
  routineExists: boolean;
}): { persist: boolean; assignments: 'settled' | 'previous' } {
  if (!input.succeeded && !weekAssignmentsEqual(input.settled, input.previous)) {
    if (!input.routineExists) return { persist: true, assignments: 'previous' };
    return { persist: false, assignments: 'settled' };
  }
  if (!input.assignmentsNeedSave) return { persist: false, assignments: 'settled' };
  return { persist: true, assignments: 'settled' };
}
