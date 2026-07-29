import { SPEED_SCHEMES, normalizeSpeedScheme } from '../../utils/speedSchemes';

type Props = {
  value: string | number | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
};

/**
 * Prescription speed dropdown: 1/3 · 1/2 · 1/1.
 * Legacy values not in the list remain selectable until changed.
 */
export function SpeedSchemeSelect({
  value,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel = 'Speed'
}: Props) {
  const normalized = normalizeSpeedScheme(value);
  const known = normalized != null && (SPEED_SCHEMES as readonly string[]).includes(normalized);
  const options =
    normalized && !known ? [normalized, ...SPEED_SCHEMES] : [...SPEED_SCHEMES];

  return (
    <select
      aria-label={ariaLabel}
      disabled={disabled}
      value={normalized ?? ''}
      onChange={(event) => {
        const next = event.target.value.trim();
        onChange(next ? next : null);
      }}
      className={
        className ??
        'rounded-lg border border-app-border bg-app-surface px-2 py-1.5 text-sm font-semibold text-app-text'
      }
    >
      <option value="">—</option>
      {options.map((scheme) => (
        <option key={scheme} value={scheme}>
          {scheme}
        </option>
      ))}
    </select>
  );
}
