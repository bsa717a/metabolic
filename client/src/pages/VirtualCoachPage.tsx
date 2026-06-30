import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Sparkles,
  UtensilsCrossed,
  Calculator,
  MapPin,
  RotateCcw,
  CalendarCheck,
  X
} from 'lucide-react';
import type { AppUser, VirtualCoachCheckInRecap, VirtualCoachCheckInSession, VirtualCoachCheckInState } from '../types';
import { VIRTUAL_COACHES, getVirtualCoach, type VirtualCoach } from '../data/virtualCoaches';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { CheckInRecap } from '../components/virtualCoach/CheckInRecap';
import { CoachCheckInCall } from '../components/virtualCoach/CoachCheckInCall';
import { CoachChatBox } from '../components/virtualCoach/CoachChatBox';
import { CoachWeekStatsModal } from '../components/virtualCoach/CoachWeekStats';
import { VirtualCoachProfile } from '../components/virtualCoach/VirtualCoachProfile';

function CoachCard({ coach, selected }: { coach: VirtualCoach; selected: boolean }) {
  return (
    <Link
      to={`/virtual-coach/${coach.id}`}
      className="group relative flex flex-col items-center rounded-2xl border border-app-border bg-app-surface p-6 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-md hover:border-brand-green/50"
    >
      {selected && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand-green px-2.5 py-1 text-xs font-semibold text-brand-navy">
          Selected
        </span>
      )}
      <div className="h-28 w-28 overflow-hidden rounded-full border-4" style={{ borderColor: coach.accent }}>
        <img
          src={coach.image}
          alt={coach.name}
          className="h-full w-full object-cover"
          style={{ objectPosition: '50% 18%' }}
          loading="lazy"
        />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-brand-navy dark:text-brand-off-white">{coach.name}</h3>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-app-text-muted">{coach.role}</p>
      <p className="mt-3 text-sm text-app-text-muted">{coach.vibe}</p>
      <span className="mt-4 text-sm font-semibold text-brand-green transition group-hover:text-brand-green-light">
        Meet {coach.name}
      </span>
    </Link>
  );
}

function CoachPicker({ selectedId }: { selectedId: string | null }) {
  const isSwitching = Boolean(selectedId);
  return (
    <div className="space-y-8">
      {isSwitching && (
        <Link to="/virtual-coach" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green">
          <ArrowLeft size={16} aria-hidden /> Back to my coach
        </Link>
      )}
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-green">
          <Sparkles size={14} aria-hidden /> Virtual Coach
        </div>
        <h1 className="text-2xl font-bold text-brand-navy dark:text-brand-off-white">
          {isSwitching ? 'Switch your virtual coach' : 'Choose your virtual coach'}
        </h1>
        <p className="max-w-2xl text-sm text-app-text-muted">
          Each virtual coach has their own personality and style. Pick the one that fits you, save their contact, and
          text them anytime. You can switch whenever you like.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {VIRTUAL_COACHES.map((coach) => (
          <CoachCard key={coach.id} coach={coach} selected={coach.id === selectedId} />
        ))}
      </div>
    </div>
  );
}

const HELP_ITEMS = [
  { icon: UtensilsCrossed, label: 'Daily guidance and meal ideas' },
  { icon: MapPin, label: 'Eating out and travel choices' },
  { icon: Calculator, label: 'Explain your numbers in plain language' },
  { icon: RotateCcw, label: 'Recover after an off-plan meal' },
  { icon: CalendarCheck, label: 'Prep for your real coach session' }
] as const;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function formatNextCheckIn(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function CheckInDayPicker({ day, onChange, disabled }: { day: number; onChange: (day: number) => void; disabled?: boolean }) {
  return (
    <label className="inline-flex items-center justify-center gap-2 text-sm text-app-text-muted">
      <CalendarCheck size={15} className="text-brand-green" aria-hidden />
      <span>Check-in day</span>
      <select
        value={day}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-lg border border-app-border bg-app-surface px-2 py-1 text-sm font-medium text-app-text outline-none focus:border-brand-green/60 disabled:opacity-50"
      >
        {WEEKDAYS.map((label, index) => (
          <option key={label} value={index}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CoachHelpSection({ coach }: { coach: VirtualCoach }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-app-border/70 bg-app-surface/50">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-sm font-medium text-app-text-muted">More ways {coach.name} can help</span>
        {open ? <ChevronUp size={16} className="text-app-text-muted" /> : <ChevronDown size={16} className="text-app-text-muted" />}
      </button>
      {open && (
        <ul className="space-y-2 border-t border-app-border/70 px-4 py-3">
          {HELP_ITEMS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2 text-sm text-app-text-muted">
              <Icon size={15} className="shrink-0 text-brand-green" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SelectedCoachLanding({ coach, user }: { coach: VirtualCoach; user?: AppUser | null }) {
  const [state, setState] = useState<VirtualCoachCheckInState | null>(null);
  const [activeSession, setActiveSession] = useState<VirtualCoachCheckInSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();
  const [recapOverride, setRecapOverride] = useState<VirtualCoachCheckInRecap | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<VirtualCoachCheckInState>('/api/virtual-coach/check-in/state')
      .then((result) => {
        if (!cancelled) {
          setState(result);
          if (result.inProgressSession) setActiveSession(result.inProgressSession);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load check-in');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function startCheckIn(resume = false) {
    setStarting(true);
    setError(undefined);
    try {
      if (resume && state?.inProgressSession) {
        setActiveSession(state.inProgressSession);
        return;
      }
      const session = await api<VirtualCoachCheckInSession>('/api/virtual-coach/check-in/start', { method: 'POST' });
      setActiveSession(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start check-in');
    } finally {
      setStarting(false);
    }
  }

  function handleCallEnd(recap: VirtualCoachCheckInRecap | null) {
    setActiveSession(null);
    setRecapOverride(recap);
    api<VirtualCoachCheckInState>('/api/virtual-coach/check-in/state').then(setState).catch(() => undefined);
  }

  async function startOver() {
    const session = state?.inProgressSession;
    if (session && !window.confirm('Start a new check-in? Your current in-progress conversation will be discarded.')) {
      return;
    }
    setStarting(true);
    setError(undefined);
    try {
      if (session) {
        await api<VirtualCoachCheckInState>(`/api/virtual-coach/check-in/${session.id}`, { method: 'DELETE' });
      }
      const fresh = await api<VirtualCoachCheckInSession>('/api/virtual-coach/check-in/start', { method: 'POST' });
      setActiveSession(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to restart check-in');
    } finally {
      setStarting(false);
    }
  }

  async function updateCheckInDay(day: number) {
    const previous = state;
    setState((current) => (current ? { ...current, checkInDay: day } : current));
    try {
      const updated = await api<VirtualCoachCheckInState>('/api/virtual-coach/check-in/day', {
        method: 'PUT',
        body: JSON.stringify({ day })
      });
      setState(updated);
    } catch (err) {
      setState(previous);
      setError(err instanceof Error ? err.message : 'Unable to update check-in day');
    }
  }

  const greetingName = user?.firstName ? `, ${user.firstName}` : '';
  const latestRecap = recapOverride ?? state?.latestRecap;

  if (activeSession) {
    const sessionCoach = getVirtualCoach(activeSession.coachId) ?? coach;
    return (
      <CoachCheckInCall coach={sessionCoach} initialSession={activeSession} onEnd={handleCallEnd} />
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-green">
          <Sparkles size={14} aria-hidden /> Virtual Coach
        </div>
      </header>

      <div className="grid items-center gap-8 md:grid-cols-2">
        <div className="flex flex-col items-center text-center md:items-start md:text-left">
          <button
            type="button"
            onClick={() => setShowProfile(true)}
            aria-label={`View ${coach.name}'s card`}
            className="group relative h-40 w-40 overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-green focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg"
          >
            <span
              className="absolute inset-0 rounded-full opacity-20"
              style={{ background: `radial-gradient(circle, ${coach.accent}55 0%, transparent 70%)` }}
              aria-hidden
            />
            <img
              src={coach.image}
              alt={coach.name}
              className="relative h-full w-full rounded-full border-4 object-cover shadow-md transition group-hover:brightness-95"
              style={{ borderColor: coach.accent, objectPosition: '50% 18%' }}
            />
            <span className="absolute inset-x-0 bottom-0 rounded-b-full bg-brand-navy/70 py-1 text-center text-[11px] font-semibold text-brand-off-white opacity-0 transition group-hover:opacity-100">
              View card
            </span>
          </button>
          <h1 className="mt-6 text-2xl font-bold text-brand-navy dark:text-brand-off-white">
            Hi{greetingName}, it&apos;s {coach.name}
          </h1>
          <p className="mt-3 max-w-md text-base leading-relaxed text-app-text-muted">
            {coach.tagline.split('.')[0]}.
          </p>
        </div>

        <div>
          {loading ? (
            <p className="text-center text-sm text-app-text-muted">Loading your check-in…</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2 text-center md:text-left">
                {state?.isCheckInDay && !state.inProgressSession && (
                  <p className="text-sm font-semibold text-brand-green">It&apos;s your check-in day.</p>
                )}
                <Button className="w-full py-3 text-base" disabled={starting} onClick={() => startCheckIn(Boolean(state?.inProgressSession))}>
                  {state?.inProgressSession ? 'Resume your check-in' : 'Start your check-in'}
                </Button>
                {state?.inProgressSession ? (
                  <button
                    type="button"
                    disabled={starting}
                    onClick={startOver}
                    className="text-sm font-medium text-app-text-muted underline-offset-2 hover:text-app-text hover:underline disabled:opacity-50"
                  >
                    Start over instead
                  </button>
                ) : (
                  <p className="text-sm text-app-text-muted">About 20 minutes with {coach.name}</p>
                )}
              </div>

              {state && (
                <div className="flex flex-col items-center gap-2 text-center md:items-start md:text-left">
                  <p className="text-sm text-app-text-muted">
                    Next check-in:{' '}
                    <span className="font-semibold text-app-text">{formatNextCheckIn(state.nextCheckInDate)}</span>
                  </p>
                  <CheckInDayPicker day={state.checkInDay} onChange={updateCheckInDay} disabled={starting} />
                  <button
                    type="button"
                    onClick={() => setShowStats(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-green underline-offset-2 hover:underline"
                  >
                    <BarChart3 size={15} aria-hidden /> View this week&apos;s stats
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {latestRecap && (latestRecap.win || latestRecap.focus) && (
        <CheckInRecap recap={latestRecap} coachName={coach.name} />
      )}

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        <CoachChatBox coach={coach} />
        <CoachHelpSection coach={coach} />
      </div>

      <CoachWeekStatsModal open={showStats} onClose={() => setShowStats(false)} coachName={coach.name} />

      {showProfile && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"
          role="presentation"
          onClick={() => setShowProfile(false)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-app-border bg-app-surface shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
              <h2 className="text-lg font-semibold text-app-text">{coach.name}&apos;s card</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setShowProfile(false)}
                className="rounded-full p-1.5 text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <VirtualCoachProfile coach={coach} selected />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function VirtualCoachPage({ user, picker = false }: { user?: AppUser | null; picker?: boolean }) {
  const selected = getVirtualCoach(user?.selectedVirtualCoachId);

  if (selected && !picker) {
    return <SelectedCoachLanding coach={selected} user={user} />;
  }

  return <CoachPicker selectedId={selected?.id ?? null} />;
}
