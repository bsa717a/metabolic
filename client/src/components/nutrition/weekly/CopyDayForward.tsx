import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { api } from '../../../services/api';
import { Button } from '../../ui/Button';

function CopyDayForwardPanel({
  dayLabel,
  days,
  busy,
  error,
  onDaysChange,
  onCancel,
  onCopy
}: {
  dayLabel: string;
  days: number;
  busy: boolean;
  error: string | null;
  onDaysChange: (days: number) => void;
  onCancel: () => void;
  onCopy: () => void;
}) {
  return (
    <div
      className="w-60 rounded-2xl border border-app-border bg-app-surface p-3 text-left shadow-lg"
      onClick={(event) => event.stopPropagation()}
    >
      <p className="text-sm font-semibold text-app-text">Copy {dayLabel} forward</p>
      <p className="mt-1 text-xs text-app-text-muted">
        Copies this day&apos;s planned foods into each of the next days, replacing what&apos;s planned there.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={31}
          value={days}
          onChange={(event) => onDaysChange(Number(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onCopy();
          }}
          className="w-16 rounded-lg border border-app-border bg-app-surface px-2 py-1 text-sm text-app-text focus:outline-none focus:ring-2 focus:ring-brand-green/40"
          aria-label="Number of days ahead"
        />
        <span className="text-sm text-app-text-muted">day{days === 1 ? '' : 's'} ahead</span>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm text-app-text-muted transition hover:bg-app-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCopy}
          className="rounded-lg bg-brand-green px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-green/90 disabled:opacity-50"
        >
          {busy ? 'Copying…' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export function CopyDayForward({
  date,
  dayLabel,
  onCopied,
  variant = 'icon',
  disabled = false,
  apiUrl
}: {
  date: string;
  dayLabel: string;
  onCopied: () => void | Promise<void>;
  variant?: 'icon' | 'button';
  disabled?: boolean;
  apiUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleDocClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [open]);

  async function copy() {
    if (busy) return;
    const count = Math.round(days);
    if (!Number.isFinite(count) || count < 1) {
      setError('Enter at least 1 day.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(apiUrl ?? `/api/daily-logs/${date}/copy-forward`, {
        method: 'POST',
        body: JSON.stringify({ days: count })
      });
      setOpen(false);
      await onCopied();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not copy this day.');
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
          aria-label={`Copy ${dayLabel} to future days`}
          title="Copy this day to future days"
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
          Copy forward
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
          <CopyDayForwardPanel
            dayLabel={dayLabel}
            days={days}
            busy={busy}
            error={error}
            onDaysChange={setDays}
            onCancel={() => setOpen(false)}
            onCopy={() => void copy()}
          />
        </div>
      )}
    </div>
  );
}
