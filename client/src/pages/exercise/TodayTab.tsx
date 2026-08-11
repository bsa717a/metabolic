import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { isFuture } from '../../services/api';
import { DayExerciseEditor } from '../../components/exercise/DayExerciseEditor';
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
    setActionError
  } = useExerciseArea();
  const navigate = useNavigate();

  const hasSession = useMemo(
    () => hasStoredSessionForDate(selectedDate),
    [selectedDate, weekDays]
  );

  const plannedCount = exercises.filter((item) => item.status === 'PLANNED').length;
  const future = isFuture(selectedDate);
  const canStart = !future && plannedCount > 0;

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
