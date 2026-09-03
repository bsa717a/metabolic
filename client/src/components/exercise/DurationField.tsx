import { NumberInput } from '../ui/NumberInput';
import {
  type DurationUnit,
  convertDurationInput,
  inputToSeconds,
  secondsToInput
} from '../../utils/duration';

type DurationFieldProps = {
  valueSeconds: number | null | undefined;
  onChangeSeconds: (seconds: number | null) => void;
  /** Controlled display value + unit for forms that own local string state. */
  value?: string;
  unit?: DurationUnit;
  onChangeValue?: (value: string) => void;
  onChangeUnit?: (unit: DurationUnit) => void;
  label?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  /** Dark surfaces (e.g. guided workout session). */
  tone?: 'default' | 'dark';
};

function UnitToggle({
  unit,
  onChange,
  disabled,
  tone = 'default'
}: {
  unit: DurationUnit;
  onChange: (unit: DurationUnit) => void;
  disabled?: boolean;
  tone?: 'default' | 'dark';
}) {
  const shell =
    tone === 'dark'
      ? 'inline-flex rounded-lg border border-white/20 p-0.5 text-[11px] font-semibold uppercase tracking-wide'
      : 'inline-flex rounded-lg border border-app-border p-0.5 text-[11px] font-semibold uppercase tracking-wide';
  return (
    <span className={shell} role="group" aria-label="Duration unit">
      {(['min', 'sec'] as const).map((option) => {
        const active = unit === option;
        const activeClass =
          tone === 'dark' ? 'bg-white text-slate-950' : 'bg-app-text text-app-surface';
        const idleClass =
          tone === 'dark' ? 'text-white/55 hover:text-white' : 'text-app-text-muted hover:text-app-text';
        return (
          <button
            key={option}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            className={`rounded-md px-2 py-0.5 transition ${active ? activeClass : idleClass} disabled:opacity-40`}
            onClick={(event) => {
              event.preventDefault();
              if (option === unit) return;
              onChange(option);
            }}
          >
            {option}
          </button>
        );
      })}
    </span>
  );
}

/**
 * Number + min|sec segmented control. Prefer controlled `value`/`unit` when the
 * parent already tracks draft strings; otherwise pass `valueSeconds` only.
 */
export function DurationField({
  valueSeconds,
  onChangeSeconds,
  value: controlledValue,
  unit: controlledUnit,
  onChangeValue,
  onChangeUnit,
  label = 'Duration',
  className,
  inputClassName = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2',
  disabled,
  tone = 'default'
}: DurationFieldProps) {
  const derived = secondsToInput(valueSeconds);
  const value = controlledValue ?? derived.value;
  const unit = controlledUnit ?? derived.unit;

  function emit(nextValue: string, nextUnit: DurationUnit) {
    onChangeValue?.(nextValue);
    onChangeUnit?.(nextUnit);
    onChangeSeconds(inputToSeconds(nextValue, nextUnit));
  }

  const labelClass = tone === 'dark' ? 'font-medium text-white/80' : 'font-medium text-app-text';

  return (
    <label className={className ?? 'text-sm'}>
      <span className={`flex items-center justify-between gap-2 ${labelClass}`}>
        <span>{label}</span>
        <UnitToggle
          unit={unit}
          disabled={disabled}
          tone={tone}
          onChange={(next) => emit(convertDurationInput(value, unit, next), next)}
        />
      </span>
      <NumberInput
        min={0}
        disabled={disabled}
        className={inputClassName}
        value={value}
        onChange={(next) => emit(next, unit)}
      />
    </label>
  );
}

/** Compact chip with visible min|sec toggle for inline editors. */
export function DurationChip({
  value,
  unit,
  onChangeValue,
  onChangeUnit,
  onCommit,
  disabled,
  optional
}: {
  value: string;
  unit: DurationUnit;
  onChangeValue: (value: string) => void;
  /** Called with the new unit and the display value converted to that unit. */
  onChangeUnit: (unit: DurationUnit, value: string) => void;
  onCommit: () => void;
  disabled?: boolean;
  optional?: boolean;
}) {
  return (
    <div className="inline-flex flex-col items-center gap-0.5 rounded-lg bg-app-muted/70 px-1.5 py-1">
      <NumberInput
        inputMode="numeric"
        aria-label={`Duration in ${unit === 'min' ? 'minutes' : 'seconds'}`}
        disabled={disabled}
        value={value}
        placeholder={optional ? '—' : '0'}
        onChange={onChangeValue}
        onBlur={onCommit}
        className="w-10 bg-transparent text-center text-sm font-semibold tabular-nums text-app-text outline-none disabled:opacity-50"
      />
      <UnitToggle
        unit={unit}
        disabled={disabled}
        onChange={(next) => {
          const converted = convertDurationInput(value, unit, next);
          onChangeUnit(next, converted);
        }}
      />
    </div>
  );
}
