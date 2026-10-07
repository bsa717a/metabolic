import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { isFuture } from '../../services/api';
import { DayExerciseEditor } from '../../components/exercise/DayExerciseEditor';
import { AutomaticExercise } from '../../components/exercise/automatic/AutomaticExercise';
import { Button } from '../../components/ui/Button';
import { hasStoredSessionForDate } from '../../utils/workoutSession';
import { primeAudio } from '../../utils/sessionCues';
import { useExerciseArea } from './exerciseAreaContext';

export function TodayTab() {
  const {
    selectedDate,
    selectDate,
    weekDays,
    exercisesForSelectedDate: exercises,
    reloadWeek,
    removeExercise,
    actionError,
    setActionError,
    exerciseMode,
    exerciseAuto,
    exerciseAutoSaving,
    exerciseAutoError,
    setExerciseAutoLocation,
    setExerciseAutoLevel,
    setExerciseAutoPlan,
    answerExerciseCheckIn,
    startAutomaticWorkout
  } = useExerciseArea();
  const navigate = useNavigate();

  const hasSession = useMemo(
    () => hasStoredSessionForDate(selectedDate),
    [selectedDate, weekDays]
  );

  const plannedCount = exercises.filter((item) => item.status === 'PLANNED').length;
  const future = isFuture(selectedDate);
  const canStart = !future && plannedCount > 0;

  if (exerciseMode === 'AUTOMATIC') {
    return (
      <AutomaticExercise
        location={exerciseAuto?.location ?? 'GYM'}
        level={exerciseAuto?.level ?? 'BEGINNER'}
        track={exerciseAuto?.track ?? null}
        showToday
        busy={exerciseAutoSaving}
        error={exerciseAutoError}
        onLocation={setExerciseAutoLocation}
        onLevel={setExerciseAutoLevel}
        onPlan={setExerciseAutoPlan}
        onCheckIn={answerExerciseCheckIn}
        onStart={() => {
          primeAudio();
          startAutomaticWorkout();
        }}
      />
    );
  }

  return (
    <DayExerciseEditor
      selectedDate={selectedDate}
      onSelectDate={selectDate}
      weekDays={weekDays}
      exercises={exercises}
      onReload={reloadWeek}
      onRemoveExercise={removeExercise}
      actionError={actionError}
      onClearActionError={() => setActionError(null)}
      afterProgress={
        canStart ? (
          <Button
            type="button"
            className="flex w-full items-center justify-center gap-2 py-4 text-base"
            onClick={() => {
              primeAudio();
              navigate(`/exercise/session?date=${selectedDate}`);
            }}
          >
            <Play className="h-5 w-5" />
            {hasSession ? 'Resume workout' : 'Start workout'}
          </Button>
        ) : null
      }
    />
  );
}
