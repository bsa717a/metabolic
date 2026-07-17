import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { VIRTUAL_COACHES, getVirtualCoach, type VirtualCoach, type VirtualCoachId } from '../../data/virtualCoaches';
import { VirtualCoachProfile } from '../virtualCoach/VirtualCoachProfile';
import { Button } from '../ui/Button';
import { onboardingCardClass } from './onboardingStyles';

function CoachGridCard({
  coach,
  selected,
  onOpen
}: {
  coach: VirtualCoach;
  selected: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${onboardingCardClass} group relative flex flex-col items-center p-5 text-center transition hover:border-brand-green/60 hover:bg-app-muted/60 hover:shadow-sm`}
    >
      {selected ? (
        <span className="absolute right-3 top-3 rounded-full bg-brand-green px-2.5 py-1 text-xs font-semibold text-brand-navy">
          Selected
        </span>
      ) : null}
      <div className="h-24 w-24 overflow-hidden rounded-full border-4" style={{ borderColor: coach.accent }}>
        <img
          src={coach.image}
          alt={coach.name}
          className="h-full w-full object-cover"
          style={{ objectPosition: '50% 18%' }}
          loading="lazy"
        />
      </div>
      <h3 className="mt-3 text-base font-semibold text-brand-navy dark:text-brand-off-white">{coach.name}</h3>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-app-text-muted">{coach.role}</p>
      <p className="mt-2 line-clamp-2 text-sm text-app-text-muted">{coach.vibe}</p>
      <span className="mt-3 text-sm font-semibold text-brand-green transition group-hover:text-brand-green-light">
        Meet {coach.name}
      </span>
    </button>
  );
}

export function OnboardingCoachPicker({
  selectedId,
  onSelect
}: {
  selectedId: string;
  onSelect: (id: VirtualCoachId) => void;
}) {
  const [viewingId, setViewingId] = useState<VirtualCoachId | null>(null);
  const viewingCoach = viewingId ? getVirtualCoach(viewingId) : undefined;

  function chooseCoach(id: VirtualCoachId) {
    onSelect(id);
    setViewingId(null);
  }

  if (viewingCoach) {
    const isSelected = selectedId === viewingCoach.id;

    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setViewingId(null)}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green"
        >
          <ArrowLeft size={16} aria-hidden /> Back to all coaches
        </button>

        <VirtualCoachProfile
          coach={viewingCoach}
          selected={isSelected}
          layout="poster"
          showTextAction={false}
          primaryAction={
            <Button onClick={() => chooseCoach(viewingCoach.id)} disabled={isSelected}>
              {isSelected ? `${viewingCoach.name} is your coach` : `Choose ${viewingCoach.name}`}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {VIRTUAL_COACHES.map((coach) => (
        <CoachGridCard
          key={coach.id}
          coach={coach}
          selected={coach.id === selectedId}
          onOpen={() => setViewingId(coach.id)}
        />
      ))}
    </div>
  );
}
