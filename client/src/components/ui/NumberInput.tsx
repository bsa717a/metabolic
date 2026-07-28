import {
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type ReactElement
} from 'react';

export function formatNumberDisplay(value: number) {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(6)));
}

export function parseNumberInput(
  raw: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = options.integer ? Number.parseInt(trimmed, 10) : Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  if (options.min != null && parsed < options.min) return null;
  if (options.max != null && parsed > options.max) return null;
  return parsed;
}

type SharedNumberInputProps = {
  min?: number;
  max?: number;
  step?: number | string;
  integer?: boolean;
  /** Number mode only: call onChange on blur/Enter instead of each keystroke. */
  commitOnBlur?: boolean;
  className?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  title?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  inputMode?: 'decimal' | 'numeric';
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
};

type NumberValueProps = SharedNumberInputProps & {
  value: number;
  onChange: (value: number) => void;
};

type StringValueProps = SharedNumberInputProps & {
  value: string;
  onChange: (value: string) => void;
};

export type NumberInputProps = NumberValueProps | StringValueProps;

function isStringValue(props: NumberInputProps): props is StringValueProps {
  return typeof props.value === 'string';
}

/**
 * App-wide number field: native steppers, select-on-focus, and draft typing so
 * clearing/retyping decimals (and zeros) is not blocked by controlled number state.
 *
 * Overloads keep `onChange` parameter types inferable at call sites (a plain
 * `number | string` props union makes callback params fall back to implicit any).
 */
export function NumberInput(props: NumberValueProps): ReactElement;
export function NumberInput(props: StringValueProps): ReactElement;
export function NumberInput(props: NumberInputProps): ReactElement {
  const {
    min,
    max,
    step = 'any',
    integer = false,
    commitOnBlur = false,
    className,
    id,
    name,
    placeholder,
    disabled,
    required,
    autoFocus,
    autoComplete = 'off',
    title,
    inputMode = integer ? 'numeric' : 'decimal',
    onBlur,
    onFocus,
    onKeyDown
  } = props;
  const ariaLabel = props['aria-label'];
  const ariaLabelledBy = props['aria-labelledby'];

  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const cancellingRef = useRef(false);
  const focusSnapshotRef = useRef(props.value);

  const display = draft ?? (isStringValue(props) ? props.value : formatNumberDisplay(props.value));

  function setDraftValue(next: string | null) {
    draftRef.current = next;
    setDraft(next);
  }

  function commitNumber(raw: string) {
    if (isStringValue(props)) return false;
    const parsed = parseNumberInput(raw, { min, max, integer });
    setDraftValue(null);
    if (parsed == null) return false;
    if (parsed !== props.value) props.onChange(parsed);
    return true;
  }

  function revertToFocusSnapshot() {
    setDraftValue(null);
    if (isStringValue(props) && typeof focusSnapshotRef.current === 'string') {
      if (focusSnapshotRef.current !== props.value) props.onChange(focusSnapshotRef.current);
      return;
    }
    if (!isStringValue(props) && typeof focusSnapshotRef.current === 'number') {
      if (focusSnapshotRef.current !== props.value) props.onChange(focusSnapshotRef.current);
    }
  }

  return (
    <input
      type="number"
      inputMode={inputMode}
      min={min}
      max={max}
      step={step}
      id={id}
      name={name}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
      title={title}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      value={display}
      className={className}
      onFocus={(event) => {
        focusSnapshotRef.current = props.value;
        if (isStringValue(props)) {
          setDraftValue(props.value);
        } else {
          setDraftValue(formatNumberDisplay(props.value));
        }
        event.target.select();
        onFocus?.(event);
      }}
      onChange={(event) => {
        const next = event.target.value;
        setDraftValue(next);
        if (isStringValue(props)) {
          props.onChange(next);
          return;
        }
        if (commitOnBlur) return;
        const parsed = parseNumberInput(next, { min, max, integer });
        if (parsed != null && parsed !== props.value) props.onChange(parsed);
      }}
      onBlur={(event) => {
        if (cancellingRef.current) {
          cancellingRef.current = false;
          revertToFocusSnapshot();
          onBlur?.(event);
          return;
        }
        if (!isStringValue(props)) {
          const current = draftRef.current;
          if (current !== null) commitNumber(current);
        } else {
          setDraftValue(null);
        }
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (!isStringValue(props)) {
            const current = draftRef.current;
            if (current !== null) commitNumber(current);
          } else {
            setDraftValue(null);
          }
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancellingRef.current = true;
          setDraftValue(null);
          event.currentTarget.blur();
        }
        onKeyDown?.(event);
      }}
    />
  );
}
