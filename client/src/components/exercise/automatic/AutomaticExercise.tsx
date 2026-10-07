import { useEffect, useId, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '../../ui/Button';
import { formatPlan } from '../../../utils/exerciseFormat';
import type {
  ExerciseAutoChoice,
  ExerciseAutoLevel,
  ExerciseAutoLocation,
  ExerciseAutoMode,
  ExerciseAutoTrack
} from '../../../types/exerciseAuto';

const LOCATIONS: { value: ExerciseAutoLocation; label: string }[] = [
  { value: 'HOME', label: 'Home' },
  { value: 'GYM', label: 'Gym' }
];

const LEVELS: { value: ExerciseAutoLevel; label: string }[] = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'HARD', label: 'Hard' }
];

function ChoiceButton({
  label,
  variant,
  disabled,
  onClick
}: {
  label: string;
  variant: 'primary' | 'secondary';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant={variant} className="min-h-12 flex-1 py-3 text-base" disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  );
}

export function ExerciseModeSwitch({
  mode,
  disabled,
  onChange
}: {
  mode: ExerciseAutoMode;
  disabled?: boolean;
  onChange: (mode: ExerciseAutoMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Plan mode"
      className="inline-flex w-fit max-w-full rounded-2xl border border-app-border bg-app-surface p-1 shadow-sm"
    >
      {(['MANUAL', 'AUTOMATIC'] as const).map((value) => {
        const selected = mode === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(value)}
            className={clsx(
              'rounded-xl px-4 py-2 text-sm font-bold tracking-wide transition disabled:opacity-50',
              selected ? 'bg-brand-green text-white shadow-sm' : 'text-app-text hover:bg-app-muted'
            )}
          >
            {value === 'MANUAL' ? 'Manual' : 'Automatic'}
          </button>
        );
      })}
    </div>
  );
}

function RadioRow<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex max-w-full flex-wrap rounded-xl border border-app-border bg-app-surface p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={clsx(
              'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
              selected ? 'bg-brand-green text-white' : 'text-app-text hover:bg-app-muted'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function PlanDropdown({
  plans,
  value,
  disabled,
  onChange
}: {
  plans: Array<{ id: string; name: string }>;
  value: string | null;
  disabled?: boolean;
  onChange: (planId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = plans.find((plan) => plan.id === value) ?? null;
  const empty = plans.length === 0;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full max-w-sm">
      <button
        type="button"
        aria-labelledby="automatic-plan-label"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled || empty}
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-app-border bg-app-surface px-3 text-left text-sm font-semibold text-app-text shadow-sm transition disabled:opacity-50"
      >
        <span className="truncate">{selected?.name ?? (empty ? 'No plans for this level' : 'Choose a plan')}</span>
        <ChevronDown aria-hidden className={clsx('h-4 w-4 shrink-0 text-app-text-muted transition', open && 'rotate-180')} />
      </button>
      {open && !empty && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Plans for this level"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-app-border bg-app-surface py-1 shadow-lg"
        >
          {plans.map((plan) => {
            const isSelected = plan.id === value;
            return (
              <li key={plan.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={clsx(
                    'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium',
                    isSelected ? 'bg-brand-green/15 text-app-text' : 'text-app-text hover:bg-app-muted'
                  )}
                  onClick={() => {
                    setOpen(false);
                    if (plan.id !== value) onChange(plan.id);
                  }}
                >
                  <Check aria-hidden className={clsx('h-4 w-4 shrink-0', isSelected ? 'text-brand-green' : 'opacity-0')} />
                  <span className="truncate">{plan.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function weekStatusLabel(status: 'done' | 'current' | 'upcoming') {
  if (status === 'done') return 'Done';
  if (status === 'current') return 'Current';
  return 'Upcoming';
}

export function AutomaticTrack({ track }: { track: ExerciseAutoTrack }) {
  if (track.empty) {
    return (
      <div className="rounded-2xl border border-dashed border-app-border bg-app-surface px-4 py-8 text-center text-sm text-app-text-muted">
        No workouts in this track yet. Automatic mode uses your existing exercise plans.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-app-text">{track.blockLabel}</h2>
        <p className="text-sm text-app-text-muted">
          Week {track.weekNumber} of {track.weekCount}
          {track.scheme ? ` · ${track.scheme}` : ''}
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {track.weeks.map((week) => (
          <div
            key={week.index}
            className={clsx(
              'min-w-28 flex-1 rounded-2xl border px-3 py-3',
              week.status === 'current' && 'border-brand-green bg-brand-green/10',
              week.status === 'done' && 'border-app-border bg-app-muted',
              week.status === 'upcoming' && 'border-dashed border-app-border bg-app-surface'
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Week {week.index + 1}</p>
            <p className="mt-1 text-sm font-bold text-app-text">{week.scheme}</p>
            <p className="mt-1 text-xs font-semibold text-app-text-muted">{weekStatusLabel(week.status)}</p>
          </div>
        ))}
        {track.upNext && (
          <div className="min-w-28 flex-1 rounded-2xl border border-dashed border-brand-green/50 bg-app-surface px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Up next</p>
            <p className="mt-1 text-sm font-bold text-app-text">{track.upNext.label}</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {track.days.map((day) => (
          <section key={day.name} className="rounded-2xl border border-app-border bg-app-surface p-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-app-text">{day.name}</h3>
              {day.isCurrent && (
                <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-green">
                  Today
                </span>
              )}
            </div>
            <ul className="mt-2 divide-y divide-app-border">
              {day.exercises.map((exercise, index) => (
                <li key={`${day.name}-${index}`} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="font-medium text-app-text">{exercise.name}</span>
                  <span className="shrink-0 text-app-text-muted">{formatPlan(exercise)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {track.upNext && (
        <div className="rounded-2xl border border-dashed border-brand-green/50 bg-app-muted/60 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Up next</p>
          <p className="mt-1 text-lg font-bold text-app-text">{track.upNext.label}</p>
          {track.upNext.dayNames.length > 0 && (
            <p className="mt-1 text-sm text-app-text-muted">{track.upNext.dayNames.join(' · ')}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function AutomaticExercise({
  location,
  level,
  track,
  showToday,
  busy,
  error,
  onLocation,
  onLevel,
  onPlan,
  onCheckIn,
  onStart
}: {
  location: ExerciseAutoLocation;
  level: ExerciseAutoLevel;
  track: ExerciseAutoTrack | null;
  showToday: boolean;
  busy: boolean;
  error: string | null;
  onLocation: (location: ExerciseAutoLocation) => void;
  onLevel: (level: ExerciseAutoLevel) => void;
  onPlan: (planId: string) => void;
  onCheckIn: (choice: ExerciseAutoChoice) => void;
  onStart: () => void;
}) {
  const waiting = track?.pendingCheckIn !== 'NONE' && track?.pendingCheckIn != null;
  const today = track?.today;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <RadioRow label="Gym preference" value={location} options={LOCATIONS} disabled={busy} onChange={onLocation} />
        <RadioRow label="Activity level" value={level} options={LEVELS} disabled={busy} onChange={onLevel} />
      </div>

      {track && (
        <div className="w-full max-w-sm space-y-1.5">
          <p id="automatic-plan-label" className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">
            Plan
          </p>
          <PlanDropdown
            key={`${location}-${level}`}
            plans={track.plans}
            value={track.selectedPlanId}
            disabled={busy}
            onChange={onPlan}
          />
        </div>
      )}

      {error && <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>}

      {track?.checkIn && (
        <section className="rounded-2xl border border-brand-green/40 bg-brand-green/10 p-4" aria-live="polite">
          <h2 className="text-lg font-bold text-app-text">{track.checkIn.title}</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {track.checkIn.moveUpLabel && (
              <ChoiceButton label={track.checkIn.moveUpLabel} variant="primary" disabled={busy} onClick={() => onCheckIn('move_up')} />
            )}
            {track.checkIn.repeatBlockLabel && (
              <ChoiceButton
                label={track.checkIn.repeatBlockLabel}
                variant="secondary"
                disabled={busy}
                onClick={() => onCheckIn('repeat_block')}
              />
            )}
            {track.checkIn.repeatWeekLabel && (
              <ChoiceButton
                label={track.checkIn.repeatWeekLabel}
                variant="primary"
                disabled={busy}
                onClick={() => onCheckIn('repeat_week')}
              />
            )}
            {track.checkIn.keepGoingLabel && (
              <ChoiceButton
                label={track.checkIn.keepGoingLabel}
                variant="secondary"
                disabled={busy}
                onClick={() => onCheckIn('keep_going')}
              />
            )}
          </div>
        </section>
      )}

      {showToday && today && (
        <section className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-green">Today&apos;s workout</p>
          <h2 className="mt-1 text-2xl font-bold text-app-text">{today.headline}</h2>
          <p className="mt-1 text-sm text-app-text-muted">{today.summary}</p>
          <Button
            type="button"
            className="mt-4 flex w-full items-center justify-center py-4 text-base"
            disabled={busy || today.complete || waiting}
            onClick={onStart}
          >
            {today.complete ? 'Workout complete' : today.inProgress ? 'Resume workout' : 'Start workout'}
          </Button>
        </section>
      )}

      {track && <AutomaticTrack track={track} />}
      {!track && <p className="text-sm text-app-text-muted">Loading your track…</p>}
    </div>
  );
}
