import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, ChevronDown, Flag, Target } from 'lucide-react';
import { Button } from '../ui/Button';

export function BlueprintActionsMenu({
  onComparison,
  onStart,
  onGoals
}: {
  onComparison: () => void;
  onStart: () => void;
  onGoals: () => void;
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
    'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-app-text transition hover:bg-app-muted';

  function runAndClose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="secondary"
        aria-label="Blueprint actions"
        aria-expanded={open}
        aria-haspopup="menu"
        title="Blueprint actions"
        onClick={() => setOpen((value) => !value)}
      >
        Actions
        <ChevronDown className={`ml-1 inline h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-2 min-w-[11rem] rounded-2xl border border-app-border bg-app-surface p-1 shadow-lg"
        >
          <button type="button" role="menuitem" className={itemClass} onClick={() => runAndClose(onComparison)}>
            <ArrowLeftRight className="h-4 w-4" />
            Comparison
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => runAndClose(onStart)}>
            <Flag className="h-4 w-4" />
            Start
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => runAndClose(onGoals)}>
            <Target className="h-4 w-4" />
            Goals
          </button>
        </div>
      )}
    </div>
  );
}
