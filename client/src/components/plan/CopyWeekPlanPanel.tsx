import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { formatDayAbbrev, formatDayNumber } from '../../services/api';
import {
  buildPublishPlanPayload,
  DEFAULT_PATTERN_WEEKS,
  finalizePublishPlanPayload,
  MAX_PATTERN_WEEKS,
  WEEKDAY_LABELS,
  type PatternStart,
  type PublishPlanPayload,
  type WeekdayIndex
} from '../../utils/weekdayPattern';
import { Button } from '../ui/Button';
import { NumberInput } from '../ui/NumberInput';

function publishButtonLabel({
  busy,
  hasSourcePlan,
  copying,
  clearing
}: {
  busy: boolean;
  hasSourcePlan: boolean;
  copying: boolean;
  clearing: boolean;
}) {
  if (busy) {
    if (copying && clearing) return 'Applying…';
    if (clearing) return 'Clearing…';
    return 'Copying…';
  }
  if (!hasSourcePlan && clearing) return 'Clear rest days';
  if (copying && clearing) return 'Apply schedule';
  if (copying) return 'Copy plan';
  return 'Apply';
}

export function CopyWeekPlanPanel({
  sourceLabel,
  sourceDate,
  planLabel,
  hasSourcePlan = true,
  disabled = false,
  busy = false,
  error,
  onCancel,
  onCopy
}: {
  sourceLabel: string;
  sourceDate: string;
  planLabel: string;
  hasSourcePlan?: boolean;
  disabled?: boolean;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onCopy: (payload: PublishPlanPayload) => void | Promise<void>;
}) {
  const [weekdays, setWeekdays] = useState<WeekdayIndex[]>([]);
  const [weeks, setWeeks] = useState(DEFAULT_PATTERN_WEEKS);
  const [startFrom, setStartFrom] = useState<PatternStart>('this_week');
  const [clearPassiveRest, setClearPassiveRest] = useState(false);

  useEffect(() => {
    setWeekdays([]);
    setWeeks(DEFAULT_PATTERN_WEEKS);
    setStartFrom('this_week');
    setClearPassiveRest(!hasSourcePlan);
  }, [sourceDate, hasSourcePlan]);

  const preview = useMemo(() => {
    if (!clearPassiveRest && weekdays.length === 0) return null;
    return buildPublishPlanPayload({
      anchorDate: sourceDate,
      weekdays,
      weeks,
      startFrom,
      clearPassiveRest
    });
  }, [sourceDate, weekdays, weeks, startFrom, clearPassiveRest]);

  const effectivePayload = preview ? finalizePublishPlanPayload(hasSourcePlan, preview) : null;
  const willCopy = effectivePayload ? effectivePayload.targetDates.length > 0 : false;
  const willClear = effectivePayload ? effectivePayload.clearDates.length > 0 : false;

  const canPublish =
    effectivePayload &&
    (willCopy || willClear) &&
    (hasSourcePlan || willClear);

  function toggleWeekday(index: WeekdayIndex) {
    setWeekdays((current) =>
      current.includes(index) ? current.filter((value) => value !== index) : [...current, index].sort()
    );
  }

  function handlePublish() {
    if (!effectivePayload) return;
    void onCopy(effectivePayload);
  }

  return (
    <div className="w-80 rounded-2xl border border-app-border bg-app-surface p-3 text-left shadow-lg">
      <p className="text-sm font-semibold text-app-text">
        {hasSourcePlan ? `Copy plan from ${sourceLabel}` : 'Set rest days'}
      </p>
      <p className="mt-1 text-xs text-app-text-muted">
        {hasSourcePlan
          ? `Copy this day's ${planLabel} to the workout days you choose, for several weeks ahead. Optionally clear unchecked days as rest.`
          : `This day has no ${planLabel}. Pick which weekdays are workouts — unchecked days in the block become rest (exercises removed). To copy a workout elsewhere, add ${planLabel} here first.`}
      </p>

      {hasSourcePlan && (
        <div className="mt-3 rounded-xl border border-brand-green/30 bg-brand-green/5 px-2 py-1.5 text-xs text-app-text">
          <span className="font-semibold text-brand-green">Copy from:</span> {formatDayAbbrev(sourceDate)}{' '}
          {formatDayNumber(sourceDate)}
        </div>
      )}

      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-app-text-muted">Workout days</p>
      <p className="mt-0.5 text-xs text-app-text-muted">
        {hasSourcePlan
          ? 'Checked days receive this day’s plan. Leave all unchecked to clear the whole block as rest.'
          : 'Checked days stay as-is. Leave all unchecked to clear the entire block as rest.'}
      </p>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label, index) => {
          const weekday = index as WeekdayIndex;
          const checked = weekdays.includes(weekday);
          return (
            <label
              key={label}
              className={clsx(
                'flex cursor-pointer flex-col items-center rounded-xl border px-1 py-1.5 text-center transition',
                checked
                  ? 'border-brand-green bg-brand-green/15 text-app-text'
                  : 'border-app-border bg-app-surface text-app-text-muted hover:bg-app-muted'
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                disabled={disabled || busy}
                onChange={() => toggleWeekday(weekday)}
              />
              <span className="text-[0.65rem] font-medium">{label}</span>
            </label>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-app-text">
          For
          <NumberInput
            min={1}
            max={MAX_PATTERN_WEEKS}
            integer
            value={weeks}
            disabled={disabled || busy}
            onChange={(value) => setWeeks(Math.min(MAX_PATTERN_WEEKS, Math.max(1, value || 1)))}
            className="mt-1 w-full rounded-lg border border-app-border bg-app-surface px-2 py-1.5 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-brand-green/40"
          />
          <span className="mt-0.5 block text-xs text-app-text-muted">weeks (max {MAX_PATTERN_WEEKS})</span>
        </label>

        <fieldset className="text-sm text-app-text">
          <legend className="text-sm text-app-text">Starting</legend>
          <div className="mt-1 space-y-1">
            {(
              [
                ['this_week', 'This week'],
                ['next_week', 'Next week']
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="pattern-start"
                  value={value}
                  checked={startFrom === value}
                  disabled={disabled || busy}
                  onChange={() => setStartFrom(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <label className="mt-3 flex items-start gap-2 text-sm text-app-text">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-app-border"
          checked={clearPassiveRest}
          disabled={disabled || busy}
          onChange={(event) => setClearPassiveRest(event.target.checked)}
        />
        <span>
          Clear unchecked days as rest
          <span className="block text-xs text-app-text-muted">
            Removes {planLabel} on unchecked days in the same {weeks}-week block. With no workout days selected,
            every day in the block is cleared.
          </span>
        </span>
      </label>

      {preview && (
        <p className="mt-3 text-xs text-app-text-muted">
          {willCopy && (
            <>
              Will copy {planLabel} to{' '}
              <span className="font-semibold text-app-text">{preview.targetDates.length}</span> workout day
              {preview.targetDates.length === 1 ? '' : 's'}
            </>
          )}
          {willCopy && willClear && ' and'}
          {willClear && (
            <>
              {!willCopy && 'Will'} clear{' '}
              <span className="font-semibold text-app-text">{preview.clearDates.length}</span>
              {weekdays.length === 0 ? ' day' : ' rest day'}
              {preview.clearDates.length === 1 ? '' : 's'}
              {weekdays.length === 0 && ' in this block'}
            </>
          )}
          {!willCopy && !willClear && (
            <>Select workout days and enable rest clearing, or add {planLabel} to copy.</>
          )}
          {(willCopy || willClear) && '.'}
        </p>
      )}

      {!hasSourcePlan && weekdays.length > 0 && !clearPassiveRest && (
        <p className="mt-2 text-xs text-amber-700">
          Turn on rest clearing above to remove {planLabel} on unchecked days, or add {planLabel} here to copy
          workouts.
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm text-app-text-muted transition hover:bg-app-muted"
        >
          Cancel
        </button>
        <Button
          type="button"
          disabled={disabled || busy || !canPublish}
          onClick={handlePublish}
        >
          {publishButtonLabel({ busy, hasSourcePlan, copying: willCopy, clearing: willClear })}
        </Button>
      </div>
    </div>
  );
}
