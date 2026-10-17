import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, parseDateKey } from '../../services/api';
import type { ProgramMetricSnapshot } from '../../types';
import { NumberInput } from '../ui/NumberInput';
import {
  entryOnDate,
  formatWeight,
  previousWeightPoint,
  retargetWeightInput,
  weightFieldForDate,
  weightSaveErrorMessage,
  weightSaveLabel,
  weightSaveRequest,
  weightSavedMessage,
  weightUnitLabel,
  type WeightPoint,
  type WeightUnit
} from '../../utils/weightLog';

function formatWeightDate(date: string) {
  return parseDateKey(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export function LogWeightSheet({
  programId,
  points,
  preferredUnit,
  storedUnit,
  today,
  initialDate,
  historyReady,
  onClose,
  onSaved
}: {
  programId: string;
  points: readonly WeightPoint[];
  preferredUnit: WeightUnit;
  storedUnit: string;
  today: string;
  initialDate: string;
  historyReady: boolean;
  onClose: () => void;
  onSaved: (snapshot: ProgramMetricSnapshot, message: string) => void;
}) {
  const titleId = useId();
  const errorId = useId();
  const [date, setDate] = useState(initialDate);
  const [unit, setUnit] = useState<WeightUnit>(preferredUnit);
  const [weight, setWeight] = useState(() => weightFieldForDate(points, initialDate, preferredUnit, preferredUnit));
  const [weightEdited, setWeightEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pointKey = points.map((point) => `${point.date}:${point.weight}`).join('|');
  const [seenPointKey, setSeenPointKey] = useState(pointKey);

  if (historyReady && pointKey !== seenPointKey) {
    setSeenPointKey(pointKey);
    if (!weightEdited) setWeight(weightFieldForDate(points, date, unit, preferredUnit));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, saving]);

  const existing = entryOnDate(points, date);
  const previous = previousWeightPoint(points, date);

  function changeDate(next: string) {
    setDate(next);
    setWeightEdited(false);
    setError('');
    setWeight(weightFieldForDate(points, next, unit, preferredUnit));
  }

  function changeUnit(next: WeightUnit) {
    setWeight((current) => retargetWeightInput(current, unit, next));
    setUnit(next);
  }

  async function save() {
    const request = weightSaveRequest({ weight, unit, date }, storedUnit, today, points);
    if (!request.ok) {
      setError(request.error);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const snapshot = await api<ProgramMetricSnapshot>(`/api/programs/${programId}/metric-snapshots/measurements`, {
        method: 'POST',
        body: JSON.stringify({
          date: request.date,
          metricType: 'WEIGHT',
          currentValue: request.currentValue,
          unit: request.unit
        })
      });
      onSaved(snapshot, weightSavedMessage(formatWeightDate(request.date), request.updatesExisting));
    } catch (err) {
      setError(weightSaveErrorMessage(err));
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40"
        aria-label="Close log weight"
        disabled={saving}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="log-weight-sheet"
        className="relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-app-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-brand-navy dark:text-brand-off-white">
              Log weight
            </h2>
            <p className="mt-1 text-sm text-app-text-muted">Weight, unit, and date. Nothing else is changed.</p>
          </div>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-sm font-semibold text-app-text-muted hover:bg-app-muted"
            onClick={onClose}
            disabled={saving}
          >
            Close
          </button>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!saving && historyReady) void save();
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-app-text">Weight</span>
            <NumberInput
              value={weight}
              onChange={(value) => {
                setWeightEdited(true);
                setWeight(value);
              }}
              autoFocus
              step="0.1"
              inputMode="decimal"
              placeholder="Enter weight"
              aria-label="Weight"
              className="w-full rounded-xl border border-app-border bg-app-bg px-3 py-2.5 text-base text-app-text outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/30"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-app-text">Unit</span>
              <select
                value={unit}
                aria-label="Weight unit"
                className="w-full rounded-xl border border-app-border bg-app-bg px-3 py-2.5 text-base text-app-text outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/30"
                onChange={(event) => changeUnit(event.target.value === 'kg' ? 'kg' : 'lbs')}
              >
                <option value="lbs">lb</option>
                <option value="kg">kg</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-app-text">Date</span>
              <input
                type="date"
                max={today}
                value={date}
                aria-label="Weigh-in date"
                className="w-full rounded-xl border border-app-border bg-app-bg px-3 py-2.5 text-base text-app-text outline-none focus:border-brand-green focus:ring-2 focus:ring-brand-green/30"
                onChange={(event) => {
                  if (event.target.value) changeDate(event.target.value);
                }}
              />
            </label>
          </div>

          {existing ? (
            <p className="rounded-2xl bg-brand-green/10 px-3 py-2 text-sm text-app-text">
              {formatWeightDate(date)} already has {formatWeight(existing.weight)} {weightUnitLabel(preferredUnit)}.
              Saving updates that weigh-in. Other measurements and photos from this date stay as they are.
            </p>
          ) : null}

          {previous ? (
            <p className="text-sm text-app-text-muted">
              Previous weigh-in: {formatWeight(previous.weight)} {weightUnitLabel(preferredUnit)} on{' '}
              {formatWeightDate(previous.date)}. This is not entered for you.
            </p>
          ) : (
            <p className="text-sm text-app-text-muted">No earlier weigh-in to show.</p>
          )}

          {!historyReady ? <p className="text-sm text-app-text-muted">Checking this date for an existing weigh-in…</p> : null}

          {error ? (
            <p id={errorId} role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            data-testid="weight-save-button"
            disabled={saving || !historyReady}
            className="inline-flex w-full items-center justify-center rounded-full bg-brand-navy px-4 py-3 text-sm font-semibold text-brand-off-white transition hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
          >
            {historyReady ? weightSaveLabel(existing != null, saving) : 'Loading…'}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
}
