import { RoutineEditorContent } from '../../components/exercise/RoutineEditor';
import { useExerciseArea } from './exerciseAreaContext';

export function ManageTab() {
  const { selectedDate, reloadWeek, reloadRoutine, registerUndo } = useExerciseArea();

  return (
    <div className="space-y-4">
      <p className="text-sm text-app-text-muted">
        Manage your reusable workouts, then choose which one runs on each weekday.
      </p>
      <RoutineEditorContent
        active
        selectedDate={selectedDate}
        onSaved={async () => {
          await Promise.all([reloadRoutine(), reloadWeek()]);
        }}
        registerUndo={registerUndo}
      />
    </div>
  );
}
