import { REP_SCHEMES, normalizeRepScheme } from '../../utils/repSchemes';

type Props = {
  value: string | number | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
};

/**
 * Prescription reps dropdown: 10 · 15/12/10 · 20/17/15.
 * Legacy values not in the list remain selectable until changed.
 */
export function RepSchemeSelect({
  value,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel = 'Reps'
}: Props) {
  const normalized = normalizeRepScheme(value);
  const known = normalized != null && (REP_SCHEMES as readonly string[]).includes(normalized);
  const options =
    normalized && !known ? [normalized, ...REP_SCHEMES] : [...REP_SCHEMES];

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
