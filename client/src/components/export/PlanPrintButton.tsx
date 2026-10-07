import { useEffect, useRef, useState } from 'react';
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

export type NutritionPrintChoice =
  | { orientation: 'horizontal' }
  | { orientation: 'vertical'; range: 'daily' | 'weekly' };

export function NutritionPrintButton({
  busy = false,
  onPrint
}: {
  busy?: boolean;
  onPrint: (choice: NutritionPrintChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [orientation, setOrientation] = useState<PlanPrintOrientation>('vertical');
  const rootRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setOrientation('vertical');
  }

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  function choose(choice: NutritionPrintChoice) {
    close();
    onPrint(choice);
  }

  function optionClass(selected: boolean) {
    return clsx(
      'rounded-lg px-2 py-1.5 text-sm font-semibold',
      selected ? 'bg-brand-navy text-brand-off-white' : 'text-app-text hover:bg-app-muted'
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        aria-label="Print plan"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => (open ? close() : setOpen(true))}
      >
        {busy ? 'Printing…' : 'Print'}
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Print options"
          className="absolute right-0 z-50 mt-2 w-52 rounded-2xl border border-app-border bg-app-surface p-1.5 shadow-lg"
        >
          <div role="group" aria-label="Print layout" className="grid grid-cols-2 gap-1">
            <button
              type="button"
              role="menuitem"
              aria-pressed={orientation === 'vertical'}
              className={optionClass(orientation === 'vertical')}
              onClick={() => setOrientation('vertical')}
            >
              Vertical
            </button>
            <button
              type="button"
              role="menuitem"
              className={optionClass(false)}
              onClick={() => choose({ orientation: 'horizontal' })}
            >
              Horizontal
            </button>
          </div>
          {orientation === 'vertical' && (
            <div
              role="group"
              aria-label="Print range"
              className="mt-1 grid grid-cols-2 gap-1 border-t border-app-border pt-1"
            >
              <button
                type="button"
                role="menuitem"
                className={optionClass(false)}
                onClick={() => choose({ orientation: 'vertical', range: 'daily' })}
              >
                Daily
              </button>
              <button
                type="button"
                role="menuitem"
                className={optionClass(false)}
                onClick={() => choose({ orientation: 'vertical', range: 'weekly' })}
              >
                Weekly
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
