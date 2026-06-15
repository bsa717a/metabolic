import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { AdminExercise } from '../../types';
import { Card } from '../ui/Card';
import { EditExerciseDrawer } from './EditExerciseDrawer';

function formatDefaults(exercise: AdminExercise) {
  const parts: string[] = [];
  if (exercise.defaultSets != null) parts.push(`${exercise.defaultSets} sets`);
  if (exercise.defaultReps != null) parts.push(`${exercise.defaultReps} reps`);
  if (exercise.defaultDurationMinutes != null) parts.push(`${exercise.defaultDurationMinutes} min`);
  if (exercise.defaultDistance != null) parts.push(`${exercise.defaultDistance} mi`);
  return parts.length ? parts.join(' · ') : '—';
}

export function ExerciseTable() {
  const [exercises, setExercises] = useState<AdminExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);

  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId);

  const loadExercises = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api<AdminExercise[]>('/api/admin/exercises');
      setExercises(rows);
      setSelectedExerciseId((current) =>
        current && rows.some((exercise) => exercise.id === current) ? current : null
      );
    } catch (err) {
      setExercises([]);
      setSelectedExerciseId(null);
      setError(err instanceof Error ? err.message : 'Unable to load exercises');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExercises();
  }, [loadExercises]);

  function handleSaved(updated: AdminExercise) {
    setExercises((current) => current.map((exercise) => (exercise.id === updated.id ? updated : exercise)));
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Exercise Database</h2>
            <p className="text-sm text-slate-500">Click a row to edit exercise details.</p>
          </div>
          <span className="text-sm text-slate-500">{exercises.length} total</span>
        </div>

        {loading && <p className="text-sm text-slate-500">Loading exercises...</p>}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-3 pr-4 font-medium">Exercise</th>
                  <th className="py-3 pr-4 font-medium">Category</th>
                  <th className="py-3 pr-4 font-medium">Body part</th>
                  <th className="py-3 pr-4 font-medium">Defaults</th>
                  <th className="py-3 font-medium">Video</th>
                </tr>
              </thead>
              <tbody>
                {exercises.map((exercise) => {
                  const selected = selectedExerciseId === exercise.id;
                  return (
                    <tr
                      key={exercise.id}
                      tabIndex={0}
                      onClick={() => setSelectedExerciseId(exercise.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedExerciseId(exercise.id);
                        }
                      }}
                      className={`cursor-pointer border-b border-slate-100 transition last:border-0 ${
                        selected ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 pr-4">
                        <div className="font-semibold">{exercise.name}</div>
                        {exercise.description && <div className="text-slate-500">{exercise.description}</div>}
                      </td>
                      <td className="py-3 pr-4 text-slate-600">{exercise.category ?? '—'}</td>
                      <td className="py-3 pr-4 text-slate-600">{exercise.bodyPart ?? '—'}</td>
                      <td className="py-3 pr-4 text-slate-600">{formatDefaults(exercise)}</td>
                      <td className="py-3 text-slate-600">{exercise.howToVideoUrl ? 'Yes' : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {exercises.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No exercises found.</p>}
          </div>
        )}
      </Card>

      <EditExerciseDrawer
        open={Boolean(selectedExercise)}
        exercise={selectedExercise}
        onClose={() => setSelectedExerciseId(null)}
        onSaved={handleSaved}
      />
    </>
  );
}
