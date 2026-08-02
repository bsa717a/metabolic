import { clsx } from 'clsx';
import { getVirtualCoach } from '../../data/virtualCoaches';

/** Reserved circular coach slot — never baked into chapter artwork. */
export function JourneyCoachAvatar({
  coachId,
  size = 'md',
  className,
  label
}: {
  coachId: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}) {
  const coach = getVirtualCoach(coachId);
  const px = size === 'sm' ? 'h-12 w-12' : size === 'lg' ? 'h-20 w-20' : 'h-16 w-16';

  return (
    <div className={clsx('flex shrink-0 items-center gap-3', className)}>
      <div
        className={clsx(
          'overflow-hidden rounded-full ring-2 ring-brand-gold/50 ring-offset-2 ring-offset-app-surface',
          px
        )}
      >
        {coach?.image ? (
          <img
            src={coach.image}
            alt=""
            className="h-full w-full object-cover object-top"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-app-muted text-xs font-semibold text-app-text-muted">
            Guide
          </div>
        )}
      </div>
      {label && (
        <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">{label}</p>
      )}
      <span className="sr-only">{coach ? `${coach.name}, your guide` : 'Your guide'}</span>
    </div>
  );
}
