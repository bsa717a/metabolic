import { useOutletContext } from 'react-router-dom';
import type { ExerciseRoutine } from '../../types';
import type {
  ExerciseAutoChoice,
  ExerciseAutoLevel,
  ExerciseAutoLocation,
  ExerciseAutoMode,
  ExerciseAutoState
} from '../../types/exerciseAuto';
import type { ExercisePlanUndoSnapshot } from '../../types/exercisePlanUndo';
import type { DayExercises } from '../../utils/planExportData';

export type ExerciseAreaContext = {
  selectedDate: string;
  selectDate: (date: string) => void;
  weekDates: string[];
  weekDays: DayExercises[];
  exercisesForSelectedDate: DayExercises['exercises'];
  reloadWeek: () => Promise<void>;
  routine: ExerciseRoutine | null;
  reloadRoutine: () => Promise<void>;
  removeExercise: (id: string) => Promise<void>;
  removingId: string | null;
  registerUndo: (message: string, snapshot: ExercisePlanUndoSnapshot | undefined) => void;
  loadError: string | null;
  actionError: string | null;
  setActionError: (error: string | null) => void;
  exerciseMode: ExerciseAutoMode;
  exerciseAuto: ExerciseAutoState | null;
  exerciseAutoSaving: boolean;
  exerciseAutoError: string | null;
  setExerciseMode: (mode: ExerciseAutoMode) => void;
  setExerciseAutoLocation: (location: ExerciseAutoLocation) => void;
  setExerciseAutoLevel: (level: ExerciseAutoLevel) => void;
  answerExerciseCheckIn: (choice: ExerciseAutoChoice) => void;
  startAutomaticWorkout: () => void;
};

export function useExerciseArea() {
  return useOutletContext<ExerciseAreaContext>();
}
