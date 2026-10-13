/** Saved exercise-plan name from the client's routine. Null when none is assigned. */
export function exercisePlanNameFromRoutine(
  routine: { exercisePlan?: { name?: string | null } | null } | null | undefined
): string | null {
  const name = routine?.exercisePlan?.name?.trim();
  return name ? name : null;
}
