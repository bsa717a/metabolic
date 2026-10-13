/**
 * Header line "Exercise: …". A day workout such as Friday's "Core #3" is not an
 * assigned plan. With no saved routine, do not surface the program-default day.
 */
export function coachExerciseStatusName(
  hasSavedRoutine: boolean,
  dayTemplateName: string | null | undefined
): string | null {
  if (!hasSavedRoutine) return null;
  const name = dayTemplateName?.trim();
  return name ? name : null;
}
