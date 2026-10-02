export type ExerciseAutoMode = 'MANUAL' | 'AUTOMATIC';
export type ExerciseAutoLocation = 'HOME' | 'GYM';
export type ExerciseAutoLevel = 'BEGINNER' | 'INTERMEDIATE' | 'HARD';
export type ExerciseAutoChoice = 'move_up' | 'repeat_block' | 'repeat_week' | 'keep_going';

export type ExerciseAutoExercise = {
  name: string;
  sets: number | null;
  reps: string | null;
  speed: string | null;
  durationSeconds: number | null;
  distance: number | null;
  weight: number | null;
  bodyPart: string | null;
};

export type ExerciseAutoTrack = {
  empty: boolean;
  blockLabel: string | null;
  nextBlockLabel: string | null;
  weekNumber: number;
  weekCount: number;
  scheme: string | null;
  pendingCheckIn: 'NONE' | 'BLOCK_COMPLETE' | 'MISSED_WEEK';
  checkIn: {
    kind: 'BLOCK_COMPLETE' | 'MISSED_WEEK';
    title: string;
    moveUpLabel: string | null;
    repeatBlockLabel: string | null;
    repeatWeekLabel: string | null;
    keepGoingLabel: string | null;
  } | null;
  today: {
    templateId: string;
    dayNumber: number;
    dayName: string;
    scheme: string;
    headline: string;
    summary: string;
    complete: boolean;
    inProgress: boolean;
    exercises: ExerciseAutoExercise[];
  } | null;
  weeks: Array<{ index: number; scheme: string; status: 'done' | 'current' | 'upcoming' }>;
  days: Array<{ name: string; isCurrent: boolean; exercises: ExerciseAutoExercise[] }>;
  upNext: { label: string; dayNames: string[] } | null;
};

export type ExerciseAutoState = {
  mode: ExerciseAutoMode;
  location: ExerciseAutoLocation;
  level: ExerciseAutoLevel;
  track: ExerciseAutoTrack | null;
};
