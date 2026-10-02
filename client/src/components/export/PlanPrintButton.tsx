import { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../ui/Button';
import {
  readPlanPrintOrientation,
  writePlanPrintOrientation,
  type PlanPrintOrientation
} from '../../utils/planPrintOrientation';

const OPTIONS: { value: PlanPrintOrientation; label: string }[] = [
  { value: 'vertical', label: 'Vertical' },
  { value: 'horizontal', label: 'Horizontal' }
];

export function PlanPrintButton({
  busy = false,
  onPrint
}: {
  busy?: boolean;
  onPrint: (orientation: PlanPrintOrientation) => void;
}) {
  const [orientation, setOrientation] = useState<PlanPrintOrientation>(readPlanPrintOrientation);

  function selectOrientation(next: PlanPrintOrientation) {
    setOrientation(next);
    writePlanPrintOrientation(next);
  }

  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Print layout"
        className="inline-flex overflow-hidden rounded-xl bg-app-surface ring-1 ring-inset ring-app-border"
      >
        {OPTIONS.map((option) => {
          const selected = orientation === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              className={clsx(
                'px-2.5 py-2 text-sm font-semibold sm:px-3',
                selected ? 'bg-brand-navy text-brand-off-white' : 'text-app-text hover:bg-app-muted'
              )}
              onClick={() => selectOrientation(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        aria-label="Print plan"
        onClick={() => onPrint(orientation)}
      >
        {busy ? 'Printing…' : 'Print'}
      </Button>
    </div>
  );
}
