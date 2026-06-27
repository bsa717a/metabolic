import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import {
  formatDayAbbrev,
  formatDayNumber,
  formatWeekRange,
  getWeekDates,
  isToday,
  startOfWeek
} from '../../services/api';
import type { ScheduledExercise } from '../../types';
import { WeekDateStrip } from '../nutrition/WeekDateStrip';
import { PlannedRestDayCard } from '../exercise/PlannedRestDayCard';
import {
  dayExerciseCompletionStatus,
  exerciseCompletionHighlightClass,
  exerciseStatusLabel,
  formatPlanShort,
  isPastDate
} from '../exercise/weekly/exerciseWeeklyHelpers';
import { fetchCoachExercisesForDates, type DayExercises } from '../../utils/planExportData';
import {
  analyzeExerciseWeek,
  comparisonTrendLabel,
  dayAnalysisProgressLabel,
  previousWeekDates,
  type DayPatternEntry,
  type ExerciseDayAnalysis
} from '../../utils/exerciseWeekAnalysis';
import { printCoachExerciseWeekReport } from '../../utils/printCoachExerciseWeekReport';
import { Button } from '../ui/Button';

const GRID_TEMPLATE = { gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' } as const;

function StatusMark({ status }: { status: string }) {
  if (status === 'DONE') {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-brand-green bg-brand-green/15 text-[10px] font-bold text-brand-green"
        aria-hidden
      >
        ✓
      </span>
    );
  }
  if (status === 'SKIPPED') {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-app-border bg-app-muted text-[10px] font-bold text-app-text-muted"
        aria-hidden
      >
        —
      </span>
    );
  }
  return <span className="h-4 w-4 shrink-0 rounded border border-app-border bg-app-surface" aria-hidden />;
}

function AnalysisExerciseLine({ exercise }: { exercise: ScheduledExercise }) {
  return (
    <div className="flex gap-2 py-1.5 first:pt-0 last:pb-0">
      <StatusMark status={exercise.status} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold leading-snug text-app-text">{exercise.exercise.name}</p>
        <p className="text-[0.7rem] text-app-text-muted">{formatPlanShort(exercise)}</p>
        <p className="text-[0.65rem] font-medium uppercase tracking-wide text-app-text-muted">
          {exerciseStatusLabel(exercise.status)}
        </p>
      </div>
    </div>
  );
}

function AnalysisDayColumn({
  date,
  exercises,
  dayAnalysis
}: {
  date: string;
  exercises: ScheduledExercise[];
  dayAnalysis: ExerciseDayAnalysis;
}) {
  const completionStatus = dayExerciseCompletionStatus(exercises, date);
  const showTint = isPastDate(date) && completionStatus !== 'none';
  const today = isToday(date);

  return (
    <div
      className={clsx(
        'flex min-h-[10rem] flex-col rounded-2xl border p-3',
        showTint ? exerciseCompletionHighlightClass(completionStatus) : 'border-app-border bg-app-surface'
      )}
    >
      <div className="border-b border-app-border/80 pb-2">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-app-text-muted">
          {formatDayAbbrev(date)}
        </p>
        <p
          className={clsx(
            'text-lg font-bold tabular-nums',
            today ? 'text-brand-green' : 'text-app-text',
            completionStatus === 'incomplete' && 'text-red-700 dark:text-red-300',
            completionStatus === 'complete' && isPastDate(date) && 'text-brand-green'
          )}
        >
          {formatDayNumber(date)}
        </p>
        <p className="text-[0.7rem] text-app-text-muted">{dayAnalysisProgressLabel(dayAnalysis)}</p>
      </div>

      <div className="mt-2 min-h-0 flex-1">
        {exercises.length === 0 ? (
          <PlannedRestDayCard compact className="mt-1" />
        ) : (
          <div className="divide-y divide-app-border/60">
            {exercises.map((exercise) => (
              <AnalysisExerciseLine key={exercise.id} exercise={exercise} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DayPatternRow({ entry }: { entry: DayPatternEntry }) {
  const isRest = entry.planned === 0;
  const isFuture = entry.kind === 'future';
  const pct = entry.completionPct ?? 0;

  return (
    <div className="flex items-center gap-3">
      <span className="w-9 text-xs font-semibold text-app-text-muted">{entry.label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-app-muted">
        {!isRest && !isFuture && (
          <div
            className={clsx(
              'h-full rounded-full transition-all',
              pct === 100 ? 'bg-brand-green' : pct > 0 ? 'bg-brand-gold' : 'bg-red-400'
            )}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <span className="w-20 text-right text-xs tabular-nums text-app-text-muted">
        {isRest ? 'Rest' : isFuture ? `${entry.planned} planned` : `${entry.done}/${entry.planned}`}
      </span>
    </div>
  );
}

export function CoachWeeklyExerciseReportModal({
  open,
  clientId,
  clientName,
  anchorDate,
  onClose
}: {
  open: boolean;
  clientId: string;
  clientName?: string;
  anchorDate: string;
  onClose: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState(anchorDate);
  const [days, setDays] = useState<DayExercises[]>([]);
  const [previousDays, setPreviousDays] = useState<DayExercises[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekStart = startOfWeek(selectedDate);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);
  const prevWeekDates = useMemo(() => previousWeekDates(selectedDate), [selectedDate]);

  const analysis = useMemo(
    () =>
      analyzeExerciseWeek(days, weekDates, {
        previousDays,
        previousWeekDates: prevWeekDates
      }),
    [days, weekDates, previousDays, prevWeekDates]
  );

  const trendLabel =
    analysis.comparison
      ? comparisonTrendLabel(analysis.comparison, analysis.completionPct)
      : null;

  useEffect(() => {
    if (open) setSelectedDate(anchorDate);
  }, [open, anchorDate]);

  const loadWeek = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [results, prevResults] = await Promise.all([
        fetchCoachExercisesForDates(clientId, weekDates),
        fetchCoachExercisesForDates(clientId, prevWeekDates)
      ]);
      setDays(results);
      setPreviousDays(prevResults);
    } catch (err) {
      setDays([]);
      setPreviousDays([]);
      setError(err instanceof Error ? err.message : 'Unable to load week analysis');
    } finally {
      setLoading(false);
    }
  }, [clientId, weekDates, prevWeekDates]);

  useEffect(() => {
    if (!open) return;
    void loadWeek();
  }, [open, loadWeek]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-exercise-analysis-title"
        className="relative z-10 flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-app-border bg-app-bg shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-app-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="weekly-exercise-analysis-title" className="text-xl font-bold text-app-text">
                Week analysis
              </h2>
              <p className="text-sm text-app-text-muted">
                {formatWeekRange(weekStart)}
                {clientName ? ` · ${clientName}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={() =>
                  printCoachExerciseWeekReport(days, formatWeekRange(weekStart), { clientName })
                }
              >
                Print
              </Button>
              <button
                type="button"
                aria-label="Close week analysis"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-app-border text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            <WeekDateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

            {error && <p className="text-sm text-red-600">{error}</p>}
            {loading ? (
              <p className="text-sm text-app-text-muted">Loading week…</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-brand-green/10 p-3 ring-1 ring-brand-green/20">
                    <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">
                      Completion
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-app-text">
                      {analysis.completionPct != null ? `${analysis.completionPct}%` : '—'}
                    </p>
                    {trendLabel && (
                      <p
                        className={clsx(
                          'text-xs font-semibold',
                          analysis.comparison?.trend === 'up' && 'text-brand-green',
                          analysis.comparison?.trend === 'down' && 'text-red-600 dark:text-red-400',
                          analysis.comparison?.trend === 'flat' && 'text-app-text-muted'
                        )}
                      >
                        {trendLabel}
                      </p>
                    )}
                    {!trendLabel && <p className="text-xs text-app-text-muted">through today</p>}
                  </div>
                  <div className="rounded-xl bg-brand-gold/10 p-3 ring-1 ring-brand-gold/20">
                    <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Scheduled</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-app-text">{analysis.scheduled}</p>
                    <p className="text-xs text-app-text-muted">
                      {analysis.workoutDays} workout day{analysis.workoutDays === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-app-surface p-3 ring-1 ring-app-border">
                    <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Completed</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-app-text">
                      {analysis.done || '—'}
                    </p>
                    <p className="text-xs text-app-text-muted">marked done</p>
                  </div>
                  <div className="rounded-xl bg-app-surface p-3 ring-1 ring-app-border">
                    <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Skipped</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-app-text">
                      {analysis.skipped || '—'}
                    </p>
                    <p className="text-xs text-app-text-muted">
                      {analysis.restDays} rest day{analysis.restDays === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                    <p className="text-sm font-semibold text-app-text">Day-by-day pattern</p>
                    <p className="mt-0.5 text-xs text-app-text-muted">
                      Which days are strong vs slipping — only past and today count toward completion.
                    </p>
                    <div className="mt-3 space-y-2">
                      {analysis.dayPattern.map((entry) => (
                        <DayPatternRow key={entry.date} entry={entry} />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {analysis.topSkipped.length > 0 && (
                      <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                        <p className="text-sm font-semibold text-app-text">Often skipped</p>
                        <p className="mt-0.5 text-xs text-app-text-muted">
                          Movements to swap, scale, or coach on.
                        </p>
                        <ul className="mt-3 space-y-2">
                          {analysis.topSkipped.map((item) => (
                            <li
                              key={item.name}
                              className="flex items-center justify-between gap-2 text-sm text-app-text"
                            >
                              <span className="truncate">{item.name}</span>
                              <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                {item.count}× skipped
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analysis.bodyPartMix.length > 0 && (
                      <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                        <p className="text-sm font-semibold text-app-text">Body-part mix</p>
                        <p className="mt-0.5 text-xs text-app-text-muted">Done vs scheduled by area.</p>
                        <ul className="mt-3 space-y-2">
                          {analysis.bodyPartMix.map((part) => (
                            <li key={part.bodyPart} className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate text-app-text">{part.bodyPart}</span>
                              <span className="shrink-0 text-xs tabular-nums text-app-text-muted">
                                {part.done}/{part.planned} done
                                {part.skipped > 0 ? ` · ${part.skipped} skipped` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                  <p className="text-sm font-semibold text-app-text">Coach takeaways</p>
                  <p className="mt-0.5 text-xs text-app-text-muted">
                    Use these notes to guide your next conversation with your client.
                  </p>
                  <ul className="mt-3 space-y-2">
                    {analysis.insights.map((insight) => (
                      <li key={insight} className="flex gap-2 text-sm text-app-text">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-green" />
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-app-border bg-white p-4 shadow-sm dark:bg-app-surface">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-app-border pb-3">
                    <div>
                      <p className="text-sm font-semibold text-app-text">Week at a glance</p>
                      <p className="text-xs text-app-text-muted">
                        Planned workouts, completion marks, and rest days — same layout as print.
                      </p>
                    </div>
                    <p className="text-[0.65rem] text-app-text-muted">
                      ✓ done · — skipped · empty = planned
                    </p>
                  </div>

                  <div className="overflow-x-auto pb-1">
                    <div className="min-w-[720px] grid gap-2" style={GRID_TEMPLATE}>
                      {weekDates.map((date) => {
                        const exercises = days.find((day) => day.date === date)?.exercises ?? [];
                        const dayAnalysis = analysis.days.find((day) => day.date === date);
                        if (!dayAnalysis) return null;
                        return (
                          <AnalysisDayColumn
                            key={date}
                            date={date}
                            exercises={exercises}
                            dayAnalysis={dayAnalysis}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
