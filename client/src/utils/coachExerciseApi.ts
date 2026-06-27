export function coachDailyExercisesApi(clientId: string, date: string, suffix = '') {
  return `/api/coach/users/${clientId}/daily-logs/${date}/exercises${suffix}`;
}

export function coachRestoreExercisePlanApi(clientId: string) {
  return `/api/coach/users/${clientId}/daily-logs/exercises/restore-snapshot`;
}
