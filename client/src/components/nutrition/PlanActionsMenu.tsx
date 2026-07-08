import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CopyPlus, LayoutGrid, Printer, Share2, ShoppingCart, SlidersHorizontal } from 'lucide-react';
import { Button } from '../ui/Button';

export function PlanActionsMenu({
  onCopyDay,
  copyDayDisabled = false,
  copyingDay = false,
  onGroceryList,
  onAdjustTargets,
  onMealBuilder,
  printing = null,
  sharingDay = false,
  onShareDay,
  onPrintDay,
  onPrintWeek
}: {
  onCopyDay: () => void;
  copyDayDisabled?: boolean;
  copyingDay?: boolean;
  onGroceryList: () => void;
  onAdjustTargets: () => void;
  onMealBuilder: () => void;
  printing?: 'day' | 'week' | null;
  sharingDay?: boolean;
  onShareDay: () => void | Promise<void>;
  onPrintDay: () => void;
  onPrintWeek: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const itemClass =
    'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-app-text transition hover:bg-app-muted disabled:cursor-not-allowed disabled:opacity-50';

  function runAndClose(action: () => void | Promise<void>) {
    setOpen(false);
    void action();
  }

  return (
    <div ref={rootRef} className="relative z-50">
      <Button
        type="button"
        variant="secondary"
        aria-label="Plan actions"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Plan actions"
        onClick={() => setOpen((value) => !value)}
      >
        Actions
        <ChevronDown className={`ml-1 inline h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 min-w-[11rem] rounded-2xl border border-app-border bg-app-surface p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            disabled={copyDayDisabled || copyingDay}
            onClick={() => runAndClose(onCopyDay)}
          >
            <CopyPlus className="h-4 w-4" />
            {copyingDay ? 'Copying…' : 'Copy day'}
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => runAndClose(onMealBuilder)}>
            <LayoutGrid className="h-4 w-4" />
            Day Builder
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => runAndClose(onGroceryList)}>
            <ShoppingCart className="h-4 w-4" />
            Grocery list
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => runAndClose(onAdjustTargets)}>
            <SlidersHorizontal className="h-4 w-4" />
            Adjust targets
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            disabled={sharingDay || printing !== null}
            onClick={() => runAndClose(onShareDay)}
          >
            <Share2 className="h-4 w-4" />
            {sharingDay ? 'Sharing…' : 'Share day'}
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            disabled={printing !== null || sharingDay}
            onClick={() => runAndClose(onPrintDay)}
          >
            <Printer className="h-4 w-4" />
            {printing === 'day' ? 'Printing…' : 'Print day'}
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            disabled={printing !== null || sharingDay}
            onClick={() => runAndClose(onPrintWeek)}
          >
            <Printer className="h-4 w-4" />
            {printing === 'week' ? 'Printing…' : 'Print week'}
          </button>
        </div>
      )}
    </div>
  );
}
