import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { api, formatDayAbbrev, formatDayNumber } from '../../../services/api';
import type { PublishPlanPayload } from '../../../utils/weekdayPattern';
import { Button } from '../../ui/Button';
import { CopyWeekPlanPanel } from '../../plan/CopyWeekPlanPanel';

export function CopyDayForward({
  date,
  dayLabel,
  onCopied,
  variant = 'icon',
  disabled = false,
  apiUrl,
  planLabel = 'planned foods'
}: {
  date: string;
  dayLabel: string;
  onCopied: () => void | Promise<void>;
  variant?: 'icon' | 'button';
  disabled?: boolean;
  apiUrl?: string;
  planLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const sourceLabel = dayLabel || `${formatDayAbbrev(date)} ${formatDayNumber(date)}`;

  useEffect(() => {
    function handleDocClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [open]);

  async function copy(payload: PublishPlanPayload) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(apiUrl ?? `/api/daily-logs/${date}/copy-to-dates`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setOpen(false);
      await onCopied();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish plan.');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={ref}
      className={variant === 'icon' ? 'absolute right-1 top-1/2 -translate-y-1/2' : 'relative'}
    >
      {variant === 'icon' ? (
        <button
          type="button"
          aria-label={`Publish ${dayLabel} to other days`}
          title="Publish this day to other days"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
          className="grid h-6 w-6 place-items-center rounded-full bg-brand-green/15 text-brand-green transition hover:bg-brand-green/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={15} />
        </button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => setOpen((value) => !value)}
        >
          Publish plan…
        </Button>
      )}

      {open && (
        <div
          className={
            variant === 'icon'
              ? 'absolute right-0 top-9 z-50'
              : 'absolute right-0 top-full z-50 mt-2'
          }
        >
          <CopyWeekPlanPanel
            sourceLabel={sourceLabel}
            sourceDate={date}
            planLabel={planLabel}
            disabled={disabled}
            busy={busy}
            error={error}
            onCancel={() => setOpen(false)}
            onCopy={copy}
          />
        </div>
      )}
    </div>
  );
}
