import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Droplets, Save, Undo2 } from 'lucide-react';
import { WaterBottle } from './WaterBottle';
import { api, todayDateParam } from '../../services/api';
import type { HydrationLogResponse, HydrationSummary } from '../../types/hydration';

function notifyHydrationUpdated() {
  window.dispatchEvent(new Event('hydration-updated'));
}

type HydrationPanelProps = {
  variant?: 'page' | 'drawer';
  onClose?: () => void;
};

export function HydrationPanel({ variant = 'page', onClose }: HydrationPanelProps) {
  const compact = variant === 'drawer';
  const [summary, setSummary] = useState<HydrationSummary | null>(null);
  const [goalDraft, setGoalDraft] = useState('64');
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<HydrationSummary>(`/api/hydration?${todayDateParam()}`);
      setSummary(data);
      setGoalDraft(String(data.goalOz));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load hydration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function logAmount(amountOz: number) {
    setSaving(true);
    setError('');
    try {
      const result = await api<HydrationLogResponse>(`/api/hydration/log?${todayDateParam()}`, {
        method: 'POST',
        body: JSON.stringify({ amountOz })
      });
      setSummary(result.summary);
      setCustomAmount('');
      notifyHydrationUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to log water');
    } finally {
      setSaving(false);
    }
  }

  async function saveGoal() {
    const goalOz = Number(goalDraft);
    if (!Number.isFinite(goalOz) || goalOz < 1) {
      setError('Enter a valid goal in ounces');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = await api<HydrationSummary>(`/api/hydration/goal?${todayDateParam()}`, {
        method: 'PATCH',
        body: JSON.stringify({ goalOz })
      });
      setSummary(data);
      notifyHydrationUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update goal');
    } finally {
      setSaving(false);
    }
  }

  async function undoLast() {
    setSaving(true);
    setError('');
    try {
      const data = await api<HydrationSummary>(`/api/hydration/undo?${todayDateParam()}`, { method: 'POST' });
      setSummary(data);
      notifyHydrationUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to undo entry');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-app-text-muted">Loading hydration...</p>;
  }

  if (!summary) {
    return <p className="text-sm text-red-600">{error || 'Unable to load hydration data.'}</p>;
  }

  const remainingOz = Math.max(summary.targetOz - summary.actualOz, 0);

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      {!compact && (
        <div>
          <h1 className="text-2xl font-bold text-brand-navy dark:text-brand-off-white">Hydration</h1>
          <p className="mt-1 text-sm text-app-text-muted">
            Your bottle starts full each day and empties as you log water.
          </p>
        </div>
      )}

      {compact && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-app-text">Hydration</p>
          <div className="flex items-center gap-3">
            <Link
              to="/hydration"
              onClick={onClose}
              className="text-xs font-medium text-sky-600 transition hover:text-sky-700 dark:text-sky-400"
            >
              Full page
            </Link>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-medium text-app-text-muted transition hover:text-app-text"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}

      <div className={compact ? '' : 'rounded-2xl border border-app-border bg-app-surface p-4 sm:p-6'}>
        <div className={`flex ${compact ? 'flex-col items-center gap-4' : 'flex-col items-center gap-6 sm:flex-row sm:items-start'}`}>
          <div className="flex flex-col items-center shrink-0">
            <WaterBottle
              fillFraction={summary.fillFraction}
              goalMet={summary.goalMet}
              targetOz={summary.targetOz}
              size={compact ? 'md' : 'lg'}
            />
            <p className="mt-2 text-sm font-medium text-app-text">
              {summary.goalMet ? 'Goal reached for today' : `${remainingOz} oz to go`}
            </p>
            <p className="text-xs text-app-text-muted tabular-nums">
              {summary.actualOz}/{summary.targetOz} oz logged
            </p>
          </div>

          <div className="w-full flex-1 space-y-3">
            <div>
              <p className="text-sm font-medium text-app-text">Quick add</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[8, 16, 24].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    disabled={saving}
                    onClick={() => void logAmount(amount)}
                    className="rounded-xl border border-app-border bg-app-muted px-3 py-1.5 text-sm font-semibold transition hover:bg-app-border/60 disabled:opacity-60"
                  >
                    +{amount} oz
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-app-text">Custom amount</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  type="number"
                  min={1}
                  max={512}
                  value={customAmount}
                  onChange={(event) => setCustomAmount(event.target.value)}
                  placeholder="Ounces"
                  className="w-24 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={saving || !customAmount}
                  onClick={() => void logAmount(Number(customAmount))}
                  title="Log water"
                  aria-label="Log water"
                  className="rounded-xl bg-sky-600 p-2.5 text-white transition hover:bg-sky-700 disabled:opacity-60"
                >
                  <Droplets size={18} />
                </button>
                <button
                  type="button"
                  disabled={saving || summary.recentEntries.length === 0}
                  onClick={() => void undoLast()}
                  title="Undo last entry"
                  aria-label="Undo last entry"
                  className="rounded-xl border border-app-border p-2.5 transition hover:bg-app-muted disabled:opacity-60"
                >
                  <Undo2 size={18} />
                </button>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-app-text">Daily goal (oz)</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  type="number"
                  min={1}
                  max={512}
                  value={goalDraft}
                  onChange={(event) => setGoalDraft(event.target.value)}
                  className="w-24 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveGoal()}
                  title="Save goal"
                  aria-label="Save goal"
                  className="rounded-xl border border-app-border p-2.5 transition hover:bg-app-muted disabled:opacity-60"
                >
                  <Save size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      <div className={compact ? 'rounded-xl bg-app-muted p-3' : 'rounded-2xl border border-app-border bg-app-surface p-4 sm:p-6'}>
        {!compact && <h2 className="text-lg font-bold">How often you hit your goal</h2>}
        <div className={`grid gap-2 ${compact ? 'grid-cols-3 text-center' : 'mt-4 gap-3 sm:grid-cols-3'}`}>
          <div className={compact ? '' : 'rounded-xl bg-app-muted p-4'}>
            <p className="text-[10px] uppercase text-app-text-muted">Streak</p>
            <p className={`font-bold tabular-nums ${compact ? 'text-lg' : 'mt-1 text-3xl'}`}>{summary.currentStreak}d</p>
          </div>
          <div className={compact ? '' : 'rounded-xl bg-app-muted p-4'}>
            <p className="text-[10px] uppercase text-app-text-muted">Goal days</p>
            <p className={`font-bold tabular-nums ${compact ? 'text-lg' : 'mt-1 text-3xl'}`}>{summary.goalMetDays}</p>
          </div>
          <div className={compact ? '' : 'rounded-xl bg-app-muted p-4'}>
            <p className="text-[10px] uppercase text-app-text-muted">30 days</p>
            <p className={`font-bold tabular-nums ${compact ? 'text-lg' : 'mt-1 text-3xl'}`}>{summary.last30DayHitPercent}%</p>
          </div>
        </div>
        {!compact && <p className="mt-3 text-sm text-app-text-muted">Best streak: {summary.bestStreak} days</p>}
      </div>

      {summary.recentEntries.length > 0 && (
        <div className={compact ? 'rounded-xl bg-app-muted p-3' : 'rounded-2xl border border-app-border bg-app-surface p-4 sm:p-6'}>
          {!compact && <h2 className="text-lg font-bold">Today&apos;s log</h2>}
          {compact && <p className="mb-2 text-xs font-semibold uppercase text-app-text-muted">Today&apos;s log</p>}
          <ul className="space-y-1.5">
            {summary.recentEntries.slice(0, compact ? 4 : 10).map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded-lg bg-app-surface/80 px-2.5 py-1.5 text-sm dark:bg-app-bg/40"
              >
                <span>{entry.amountOz} oz</span>
                <span className="text-xs text-app-text-muted">
                  {entry.source.toLowerCase()} ·{' '}
                  {new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
