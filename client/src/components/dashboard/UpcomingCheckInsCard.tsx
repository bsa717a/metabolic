import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, toDateKey } from '../../services/api';
import type { CoachClient } from '../../types';
import { Card } from '../ui/Card';

const MAX_CHECK_INS = 6;

function clientName(client: CoachClient) {
  return `${client.firstName} ${client.lastName}`;
}

function formatCheckInWhen(startsAt: string) {
  const date = new Date(startsAt);
  const dateKey = toDateKey(date);
  const todayKey = toDateKey(new Date());
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);

  const timeLabel = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC'
  });

  if (dateKey === todayKey) return `Today · ${timeLabel}`;
  if (dateKey === tomorrowKey) return `Tomorrow · ${timeLabel}`;

  const dateLabel = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
  return `${dateLabel} · ${timeLabel}`;
}

function coachCheckInHref(client: CoachClient) {
  if (!client.nextCheckInAt || !client.nextCheckInId) return '/coach';
  const params = new URLSearchParams({
    client: client.id,
    view: 'calendar',
    date: toDateKey(new Date(client.nextCheckInAt)),
    checkIn: client.nextCheckInId
  });
  return `/coach?${params.toString()}`;
}

export function UpcomingCheckInsCard() {
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await api<CoachClient[]>('/api/coach/users');
      setClients(rows);
    } catch (err) {
      setClients([]);
      setError(err instanceof Error ? err.message : 'Unable to load check-ins');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upcomingCheckIns = useMemo(
    () =>
      clients
        .filter((client) => client.nextCheckInAt && client.nextCheckInId)
        .sort((a, b) => a.nextCheckInAt!.localeCompare(b.nextCheckInAt!))
        .slice(0, MAX_CHECK_INS),
    [clients]
  );

  return (
    <Card className="sm:col-span-2 lg:col-span-3">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-app-text">Upcoming check-ins</h2>
          <p className="text-sm text-app-text-muted">Next scheduled sessions with your clients.</p>
        </div>
        <Link
          to="/coach?view=calendar"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-navy transition hover:opacity-80 dark:text-brand-green"
        >
          Coach workspace
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-app-text-muted">Loading check-ins…</p>
      ) : error ? (
        <div>
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 text-sm font-semibold text-brand-green transition hover:text-brand-deep"
          >
            Try again
          </button>
        </div>
      ) : upcomingCheckIns.length === 0 ? (
        <p className="text-sm text-app-text-muted">No upcoming check-ins scheduled.</p>
      ) : (
        <ul className="space-y-2">
          {upcomingCheckIns.map((client) => (
            <li key={client.id}>
              <Link
                to={coachCheckInHref(client)}
                className="flex items-center gap-3 rounded-xl border border-app-border bg-app-surface px-3 py-2.5 transition hover:bg-app-muted"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-300">
                  <CalendarClock className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-app-text">{clientName(client)}</span>
                  <span className="block text-sm text-app-text-muted">
                    {formatCheckInWhen(client.nextCheckInAt!)}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-app-text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
