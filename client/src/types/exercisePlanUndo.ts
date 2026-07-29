export type ExercisePlanSnapshotItem = {
  exerciseId: string;
  sets?: number | null;
  reps?: string | number | null;
  speed?: string | number | null;
  durationMinutes?: number | null;
  distance?: number | null;
  weight?: number | null;
  status: string;
  sortOrder: number;
};

export type ExerciseDayPlanSnapshot = {
  date: string;
  exercises: ExercisePlanSnapshotItem[];
};

export type ExercisePlanUndoSnapshot = {
  days: ExerciseDayPlanSnapshot[];
};

export type ExercisePlanUndoResponse = {
  undoSnapshot?: ExercisePlanUndoSnapshot;
};
