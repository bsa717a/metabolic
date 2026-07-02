import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Sprout } from 'lucide-react';
import { api } from '../../services/api';
import type { PlanProposal, PlanStatus } from '../../types';

function formatDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function dayOfWeekLine(status: PlanStatus) {
  if (status.weekNumber == null || status.planDayIndex == null || !status.effectiveDate) return null;
  if (status.planDayIndex < 1) return `Week ${status.weekNumber} starts ${formatDate(status.effectiveDate)}`;
  const dayLabel =
    status.planDayIndex <= 7
      ? `day ${status.planDayIndex} of 7`
      : `day ${status.planDayIndex}`;
  return `Week ${status.weekNumber} · ${dayLabel}`;
}

/** The one place that answers "am I on a plan?" — renders all three plan states. */
export function PlanStatusCard() {
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [proposal, setProposal] = useState<PlanProposal | null>(null);
  const [adopting, setAdopting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setFetchError(null);
    return api<PlanStatus>('/api/plan-status')
      .then((data) => {
        setStatus(data);
        setFetchError(null);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Could not load plan status';
        if (message === 'No active program') {
          setStatus(null);
          setFetchError(null);
        } else {
          setFetchError(message);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !status) return null;

  if (fetchError && !status) {
    return (
      <div className="max-w-md rounded-2xl border border-dashed border-app-border bg-app-surface px-5 py-4">
        <p className="text-sm text-app-text-muted">{fetchError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 text-sm font-bold text-brand-green transition hover:text-brand-deep"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!status) return null;

  async function showProposal() {
    setError(null);
    try {
      setProposal(await api<PlanProposal>('/api/plan-proposal'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check for a plan.');
    }
  }

  async function adopt() {
    setAdopting(true);
    setError(null);
    try {
      const updated = await api<PlanStatus>('/api/plan-adopt', { method: 'POST' });
      setStatus(updated);
      setProposal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start your plan.');
    } finally {
      setAdopting(false);
    }
  }

  if (status.state === 'on_plan') {
    const weekLine = dayOfWeekLine(status);
    return (
      <div className="text-left sm:text-right">
        {fetchError && (
          <p className="mb-2 text-xs text-amber-700">
            Couldn&apos;t refresh plan status.{' '}
            <button type="button" onClick={() => void load()} className="font-semibold underline">
              Retry
            </button>
          </p>
        )}
        <p className="text-sm font-semibold text-brand-navy dark:text-brand-off-white">
          <Sprout size={16} className="mb-0.5 mr-1 inline text-brand-green" aria-hidden />
          Your Metabolic Plan
        </p>
        <p className="mt-1 text-sm text-app-text-muted">{weekLine ?? 'Week 1 starts at your first check-in'}</p>
        {status.nextCheckInDate && (
          <p className="text-sm text-app-text-muted">
            <CalendarCheck size={14} className="mb-0.5 mr-1 inline text-brand-green" aria-hidden />
            Next check-in {formatDate(status.nextCheckInDate)}
          </p>
        )}
        <Link to="/nutrition" className="mt-1 inline-block text-sm font-bold text-brand-green transition hover:text-brand-deep">
          Build today&apos;s meals →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md rounded-2xl border border-dashed border-app-border bg-app-surface px-5 py-4">
      {fetchError && (
        <p className="mb-3 text-xs text-amber-700">
          Couldn&apos;t refresh plan status.{' '}
          <button type="button" onClick={() => void load()} className="font-semibold underline">
            Retry
          </button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Sprout size={22} className="shrink-0 text-app-text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-app-text">You&apos;re tracking freely — no plan yet</p>
          <p className="text-sm text-app-text-muted">
            {status.state === 'coached_no_plan'
              ? 'Your coach hasn’t assigned a plan. You can start a matched one now.'
              : 'A weekly plan gives you built meals, portions sized to you, and a weekly check-in rhythm.'}
          </p>
        </div>
        {!proposal && (
          <button
            type="button"
            onClick={() => void showProposal()}
            className="shrink-0 rounded-xl bg-brand-green px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-deep"
          >
            Get a weekly plan
          </button>
        )}
      </div>

      {proposal && !proposal.eligible && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {proposal.missing.length > 0
            ? `To match you with a plan, complete your profile first: ${proposal.missing.join(', ')}.`
            : 'No plan matches your profile yet — check back soon or ask your coach.'}
        </p>
      )}

      {proposal?.eligible && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-brand-green/10 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-app-text">
            <span className="font-bold">Your matched plan:</span> {proposal.calorieTarget.toLocaleString()} kcal ·{' '}
            {proposal.proteinTarget}g protein · {proposal.mealsPerDay} meals a day, portioned to you.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setProposal(null)}
              className="rounded-xl border border-app-border bg-app-surface px-3 py-1.5 text-sm font-semibold text-app-text"
            >
              Not now
            </button>
            <button
              type="button"
              disabled={adopting}
              onClick={() => void adopt()}
              className="rounded-xl bg-brand-green px-4 py-1.5 text-sm font-bold text-white transition hover:bg-brand-deep disabled:opacity-50"
            >
              {adopting ? 'Starting…' : 'Start this plan'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
