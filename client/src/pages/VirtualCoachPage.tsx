import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Sparkles } from 'lucide-react';
import type { AppUser } from '../types';
import { VIRTUAL_COACHES, getVirtualCoach, type VirtualCoach } from '../data/virtualCoaches';
import { VirtualCoachProfile } from '../components/virtualCoach/VirtualCoachProfile';

function CoachCard({ coach, selected }: { coach: VirtualCoach; selected: boolean }) {
  return (
    <Link
      to={`/virtual-coach/${coach.id}`}
      className="group relative flex flex-col items-center rounded-2xl border border-app-border bg-app-surface p-6 text-center shadow-sm transition-all hover:-translate-y-1 hover:shadow-md hover:border-brand-green/50"
    >
      {selected && (
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand-green px-2.5 py-1 text-xs font-semibold text-brand-navy">
          <Check size={12} aria-hidden /> Selected
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

function SelectedCoachSection({ coach }: { coach: VirtualCoach }) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-green">
          <Sparkles size={14} aria-hidden /> Virtual Coach
        </div>
        <h1 className="text-2xl font-bold text-brand-navy dark:text-brand-off-white">Your virtual coach</h1>
      </header>

      <VirtualCoachProfile coach={coach} selected />
    </div>
  );
}

export function VirtualCoachPage({ user, picker = false }: { user?: AppUser | null; picker?: boolean }) {
  const selected = getVirtualCoach(user?.selectedVirtualCoachId);

  if (selected && !picker) {
    return <SelectedCoachSection coach={selected} />;
  }

  return <CoachPicker selectedId={selected?.id ?? null} />;
}
