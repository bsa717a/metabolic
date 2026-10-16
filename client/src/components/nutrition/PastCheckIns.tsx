import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { api, parseDateKey } from '../../services/api';

function formatPastCheckInDate(date: string): string {
  return parseDateKey(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

export function PastCheckIns({
  selectedDate,
  onSelect,
  clientId
}: {
  selectedDate: string;
  onSelect: (date: string) => void;
  /** Coach view of a client. Omit for the signed-in client. */
  clientId?: string;
}) {
  const [dates, setDates] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = clientId ? `/api/coach/users/${clientId}/check-in-dates` : '/api/check-in-dates';
    api<{ dates: string[] }>(path)
      .then((payload) => {
        if (!cancelled) {
          setDates(payload.dates);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDates([]);
          setError('Past check-ins could not be loaded.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (error) {
    return <p className="text-sm text-app-text-muted">{error}</p>;
  }
  if (!dates?.length) return null;

  return (
    <section aria-label="Past check-ins" className="space-y-2">
      <h2 className="text-sm font-semibold text-app-text">Past check-ins</h2>
      <ul className="max-h-48 overflow-y-auto rounded-2xl border border-app-border bg-app-surface">
        {dates.map((date) => {
          const selected = date === selectedDate;
          return (
            <li key={date} className="border-b border-app-border last:border-b-0">
              <button
                type="button"
                onClick={() => onSelect(date)}
                aria-current={selected ? 'date' : undefined}
                className={clsx(
                  'flex w-full items-center px-3 py-2 text-left text-sm transition hover:bg-app-muted',
                  selected ? 'bg-brand-green/10 font-semibold text-app-text' : 'text-app-text'
                )}
              >
                {formatPastCheckInDate(date)}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
