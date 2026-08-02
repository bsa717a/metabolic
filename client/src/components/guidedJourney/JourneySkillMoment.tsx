import { JourneyOverlayCard } from './JourneyOverlayCard';

/** Calm skill-earned presentation — CSS emblem slot (no SVG). */
export function JourneySkillMoment({
  title,
  description
}: {
  title: string;
  description: string;
  skillAssetId?: string;
}) {
  return (
    <JourneyOverlayCard className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
      <div className="relative grid h-24 w-24 shrink-0 place-items-center">
        <div className="absolute inset-0 rounded-full bg-brand-gold/20" aria-hidden />
        <div className="relative grid h-20 w-20 place-items-center rounded-full border-[3px] border-brand-gold bg-gradient-to-b from-brand-green/30 to-brand-green/10 shadow-md">
          <span className="h-8 w-8 rounded-full bg-brand-green/50" />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-gold">Skill earned</p>
        <p className="mt-1 text-lg font-bold text-brand-navy dark:text-brand-off-white">{title}</p>
        <p className="mt-1 text-sm text-app-text-muted">{description}</p>
      </div>
    </JourneyOverlayCard>
  );
}
