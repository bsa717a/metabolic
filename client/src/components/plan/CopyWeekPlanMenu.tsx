import { useEffect, useRef, useState } from 'react';
import { formatDayAbbrev, formatDayNumber } from '../../services/api';
import type { PublishPlanPayload } from '../../utils/weekdayPattern';
import { Button } from '../ui/Button';
import { CopyWeekPlanPanel } from '../plan/CopyWeekPlanPanel';

export function CopyWeekPlanMenu({
  sourceDate,
  planLabel,
  buttonLabel = 'Publish plan…',
  hasSourcePlan = true,
  disabled = false,
  onCopy
}: {
  sourceDate: string;
  planLabel: string;
  buttonLabel?: string;
  hasSourcePlan?: boolean;
  disabled?: boolean;
  onCopy: (payload: PublishPlanPayload) => void | Promise<void | false>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const sourceLabel = `${formatDayAbbrev(sourceDate)} ${formatDayNumber(sourceDate)}`;

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  async function handleCopy(payload: PublishPlanPayload) {
    setBusy(true);
    setError(null);
    try {
      const result = await onCopy(payload);
      if (result === false) return;
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish plan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Button variant="secondary" disabled={disabled || busy} onClick={() => setOpen((value) => !value)}>
        {hasSourcePlan ? buttonLabel : 'Set rest days…'}
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2">
          <CopyWeekPlanPanel
            sourceLabel={sourceLabel}
            sourceDate={sourceDate}
            planLabel={planLabel}
            hasSourcePlan={hasSourcePlan}
            disabled={disabled}
            busy={busy}
            error={error}
            onCancel={() => setOpen(false)}
            onCopy={handleCopy}
          />
        </div>
      )}
    </div>
  );
}
