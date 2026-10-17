import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, parseDateKey } from '../../services/api';
import type { ProgramMetricSnapshot } from '../../types';
import { Button } from '../ui/Button';
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
        className="absolute inset-0 bg-slate-950/30"
        aria-label="Close log weight"
        disabled={saving}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="log-weight-sheet"
        className="relative flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-app-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-app-text shadow-2xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-bold text-app-text">
              Log weight
            </h2>
            <p className="mt-1 text-sm text-app-text-muted">Weight, unit, and date. Nothing else is changed.</p>
          </div>
          <button
            type="button"
            className="shrink-0 text-app-text-muted transition hover:text-app-text"
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
              className="w-full rounded-xl border border-app-border bg-app-bg px-3.5 py-2.5 text-sm text-app-text placeholder:text-app-text-muted focus:border-brand-green focus:outline-none"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-app-text">Unit</span>
              <select
                value={unit}
                aria-label="Weight unit"
                className="w-full rounded-xl border border-app-border bg-app-bg px-3.5 py-2.5 text-sm text-app-text placeholder:text-app-text-muted focus:border-brand-green focus:outline-none"
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
                className="w-full rounded-xl border border-app-border bg-app-bg px-3.5 py-2.5 text-sm text-app-text placeholder:text-app-text-muted focus:border-brand-green focus:outline-none"
                onChange={(event) => {
                  if (event.target.value) changeDate(event.target.value);
                }}
              />
            </label>
          </div>

          {existing ? (
            <p className="rounded-2xl border border-brand-green/20 bg-brand-green/10 p-4 text-sm text-app-text">
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

          <Button
            type="submit"
            data-testid="weight-save-button"
            disabled={saving || !historyReady}
            className="w-full py-3"
          >
            {historyReady ? weightSaveLabel(existing != null, saving) : 'Loading…'}
          </Button>
        </form>
      </div>
    </div>,
    document.body
  );
}
