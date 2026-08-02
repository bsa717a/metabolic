import { clsx } from 'clsx';
import { Heart, Leaf, Mountain, PersonStanding, Sparkles } from 'lucide-react';

const PILLAR_ICONS: Record<string, typeof Leaf> = {
  AWARENESS: Sparkles,
  NOURISHMENT: Leaf,
  MOVEMENT: PersonStanding,
  RECOVERY: Heart,
  CONNECTION: Mountain,
  MINDSET: Sparkles,
  NUTRITION: Leaf,
  ENVIRONMENT: Mountain
};

/** Subtle pillar marks — icons only; labels remain accessible HTML. */
export function JourneyPillarMarks({
  pillars,
  className
}: {
  pillars: string[];
  className?: string;
}) {
  return (
    <ul className={clsx('flex flex-wrap gap-3', className)} aria-label="Pillars in this chapter">
      {pillars.map((pillar) => {
        const Icon = PILLAR_ICONS[pillar] ?? Sparkles;
        return (
          <li key={pillar} className="flex flex-col items-center gap-1">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-app-border/70 bg-app-muted/50 text-app-text-muted">
              <Icon size={16} strokeWidth={1.5} aria-hidden />
            </span>
            <span className="max-w-[4.5rem] text-center text-[10px] font-medium uppercase tracking-wide text-app-text-muted">
              {pillar.toLowerCase()}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
