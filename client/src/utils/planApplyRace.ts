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
 * A swap made during a successful save stays on screen. A failed save restores
 * the previous plan, including when a swap was already on screen, so that swap
 * is not kept as the rejected plan.
 */
export function assignmentsAfterPlanApply<T extends WeekAssignment>(input: {
  succeeded: boolean;
  sent: readonly T[];
  local: readonly T[];
  previous: readonly T[];
  server: readonly T[];
}): T[] {
  if (input.succeeded && !weekAssignmentsEqual(input.sent, input.local)) return [...input.local];
  return input.succeeded ? [...input.server] : [...input.previous];
}

/**
 * Whether a waiting add/remove should PUT after a plan apply settles.
 *
 * An in-flight swap of the rejected plan must not be written: changing those
 * template ids drops exclusions, extras, and overrides. A weekday change made
 * after the rollback (it differs from the week at settlement) is a new edit
 * and must be saved, so the following add or remove lands on that day.
 */
export function shouldPersistAfterPlanApply(input: {
  succeeded: boolean;
  settled: readonly WeekAssignment[];
  /** Week on screen when the apply finished, before any later edit. */
  atSettlement: readonly WeekAssignment[];
  /** In-flight week that must not be saved when the apply failed. */
  rejected?: readonly WeekAssignment[];
  previous: readonly WeekAssignment[];
  assignmentsNeedSave: boolean;
  routineExists: boolean;
}): { persist: boolean; assignments: 'settled' | 'previous' } {
  const rejectedSwap =
    !input.succeeded &&
    input.rejected != null &&
    weekAssignmentsEqual(input.settled, input.rejected) &&
    !weekAssignmentsEqual(input.rejected, input.previous);
  if (rejectedSwap) {
    if (!input.routineExists) return { persist: true, assignments: 'previous' };
    return { persist: false, assignments: 'settled' };
  }

  const editedSinceSettlement = !weekAssignmentsEqual(input.settled, input.atSettlement);
  if (editedSinceSettlement) {
    if (!input.assignmentsNeedSave) return { persist: false, assignments: 'settled' };
    return { persist: true, assignments: 'settled' };
  }

  // Still the week from the moment the apply finished.
  if (!input.succeeded && !weekAssignmentsEqual(input.settled, input.previous)) {
    if (!input.routineExists) return { persist: true, assignments: 'previous' };
    return { persist: false, assignments: 'settled' };
  }
  if (!input.assignmentsNeedSave) return { persist: false, assignments: 'settled' };
  return { persist: true, assignments: 'settled' };
}
