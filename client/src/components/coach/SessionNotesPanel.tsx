import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Dumbbell, Send, UtensilsCrossed, CalendarPlus } from 'lucide-react';
import { api, toDateKey } from '../../services/api';
import type { CoachSession } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

function formatSessionDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function QuickAction({
  icon,
  label,
  onClick,
  disabled
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-xl border border-app-border px-3 py-2 text-left text-sm font-medium transition hover:bg-app-muted disabled:opacity-50"
    >
      <span className="text-app-text-muted">{icon}</span>
      {label}
    </button>
  );
}

export function SessionNotesPanel({
  clientId,
  clientName,
  onScheduleSession,
  onSendResults
}: {
  clientId: string;
  clientName: string;
  onScheduleSession: () => void;
  onSendResults: () => void;
}) {
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [notes, setNotes] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const todayUtc = toDateKey(new Date());

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError('');
    try {
      const rows = await api<CoachSession[]>(`/api/coach/sessions?userId=${encodeURIComponent(clientId)}`);
      setSessions(rows);
      const todaySession = rows.find((session) => session.occurredAt.slice(0, 10) === todayUtc);
      setActiveSessionId(todaySession?.id ?? null);
      setNotes(todaySession?.notes ?? '');
    } catch (err) {
      setSessions([]);
      setError(err instanceof Error ? err.message : 'Unable to load sessions');
    } finally {
      setLoading(false);
    }
  }, [clientId, todayUtc]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveNote() {
    if (!notes.trim()) {
      setError('Enter some notes first.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (activeSessionId) {
        await api(`/api/coach/sessions/${activeSessionId}`, {
          method: 'PATCH',
          body: JSON.stringify({ notes: notes.trim() })
        });
      } else {
        await api('/api/coach/sessions', {
          method: 'POST',
          body: JSON.stringify({ userId: clientId, notes: notes.trim() })
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save note');
    } finally {
      setSaving(false);
    }
  }

  const pastSessions = useMemo(
    () => sessions.filter((session) => session.id !== activeSessionId),
    [sessions, activeSessionId]
  );

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Session notes</h2>
        <span className="text-sm text-app-text-muted">{formatSessionDate(`${todayUtc}T12:00:00Z`)}</span>
      </div>

      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={6}
        placeholder={`Notes from today's session with ${clientName}...`}
        className="mt-3 w-full resize-y rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm"
        disabled={loading}
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <Button className="mt-3 w-full" disabled={saving || loading} onClick={() => void saveNote()}>
        {saving ? 'Saving...' : activeSessionId ? 'Update note' : 'Save note'}
      </Button>

      <div className="mt-6 border-t border-app-border pt-4">
        <p className="mb-2 text-xs font-semibold uppercase text-app-text-muted">Quick actions</p>
        <div className="space-y-2">
          <QuickAction icon={<CalendarPlus className="h-4 w-4" />} label="Schedule next session" onClick={onScheduleSession} />
          <QuickAction icon={<Send className="h-4 w-4" />} label="Send results" onClick={onSendResults} />
        </div>
        <p className="mt-2 text-xs text-app-text-muted">
          <span className="inline-flex items-center gap-1">
            <UtensilsCrossed className="h-3.5 w-3.5" />
            <Dumbbell className="h-3.5 w-3.5" />
          </span>{' '}
          Apply nutrition and exercise templates from the Food Plan and Exercise Plan tabs.
        </p>
      </div>

      <div className="mt-6 border-t border-app-border pt-4">
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 text-sm font-semibold"
        >
          <span>Past sessions{pastSessions.length ? ` (${pastSessions.length})` : ''}</span>
          <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
        </button>
        {historyOpen && (
          <div className="mt-3 space-y-2">
            {pastSessions.length === 0 ? (
              <p className="text-sm text-app-text-muted">No past sessions yet.</p>
            ) : (
              pastSessions.map((session) => (
                <div key={session.id} className="rounded-xl border border-app-border p-3">
                  <p className="text-xs font-semibold text-app-text-muted">{formatSessionDate(session.occurredAt)}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{session.notes}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
