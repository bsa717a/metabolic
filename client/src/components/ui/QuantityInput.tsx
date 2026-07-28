import { NumberInput } from './NumberInput';
import type { FocusEventHandler, KeyboardEventHandler } from 'react';

export { formatNumberDisplay as formatQuantityDisplay, parseNumberInput as parseQuantityInput } from './NumberInput';

type QuantityInputProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  'aria-label'?: string;
  autoFocus?: boolean;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
};

/** Food-quantity defaults on top of the shared NumberInput behavior. */
export function QuantityInput({
  value,
  onChange,
  min = 0.25,
  max = 100,
  step = 0.25,
  className,
  'aria-label': ariaLabel,
  autoFocus,
  onBlur,
  onKeyDown
}: QuantityInputProps) {
  return (
    <NumberInput
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      step={step}
      className={className}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  );
}
