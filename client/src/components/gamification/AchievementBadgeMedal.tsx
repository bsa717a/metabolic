import { clsx } from 'clsx';
import { BadgeIcon } from './BadgeIcon';
import { badgeArtUrl } from './badgeArt';
import { resolveBadgeDisplay } from './badgeDisplay';

const SIZES = {
  sm: { disc: 48, icon: 20, label: false, art: 48 },
  md: { disc: 80, icon: 32, label: true, art: 96 },
  lg: { disc: 112, icon: 44, label: true, art: 160 },
  xl: { disc: 160, icon: 56, label: true, art: 280 }
} as const;

function shortLabel(name: string) {
  if (name.length <= 22) return name;
  return name.replace(/^(\S+\s+\S+).*/, '$1').trim();
}

export function AchievementBadgeMedal({
  badgeId,
  name,
  icon,
  size = 'lg',
  earned: earnedProp = false,
  locked: lockedProp = false,
  inProgress: inProgressProp = false,
  status
}: {
  badgeId?: string;
  name: string;
  icon: string;
  size?: keyof typeof SIZES;
  earned?: boolean;
  locked?: boolean;
  inProgress?: boolean;
  /** When set, applies preview override from badgeDisplay.ts */
  status?: string;
}) {
  const resolved = status ? resolveBadgeDisplay(status) : null;
  const earned = resolved?.earned ?? earnedProp;
  const locked = resolved?.locked ?? lockedProp;
  const inProgress = resolved?.inProgress ?? inProgressProp;
  const dims = SIZES[size];
  const label = shortLabel(name);
  const artUrl = badgeId ? badgeArtUrl(badgeId) : null;

  if (artUrl) {
    const px = dims.art;
    return (
      <div className="flex flex-col items-center" title={name}>
        <img
          src={artUrl}
          alt={name}
          width={px}
          height={px}
          className={clsx(
            'bg-transparent object-contain transition-all duration-300',
            locked && 'opacity-50 grayscale',
            inProgress && !earned && 'opacity-85'
          )}
        />
        {inProgress && !earned && (
          <span className="mt-1 text-[9px] font-medium text-brand-green">In progress</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={clsx('flex flex-col items-center', dims.label ? 'gap-2' : 'gap-0')}
      title={name}
    >
      <div
        className={clsx(
          'relative grid place-items-center rounded-full transition-all duration-300',
          locked && 'opacity-50 grayscale',
          inProgress && !earned && 'opacity-85',
          earned && 'drop-shadow-[0_6px_18px_rgba(226,194,110,0.28)]'
        )}
        style={{ width: dims.disc, height: dims.disc }}
      >
        <div
          className={clsx(
            'absolute inset-0 rounded-full',
            earned
              ? 'bg-gradient-to-br from-brand-gold via-[#e8d49a] to-[#b8923f] p-[3px]'
              : 'bg-gradient-to-br from-app-border to-app-text-muted/30 p-[2px]'
          )}
        >
          <div
            className={clsx(
              'h-full w-full rounded-full',
              earned
                ? 'bg-gradient-to-br from-brand-off-white via-white to-brand-green/10 dark:from-app-surface dark:via-app-muted dark:to-brand-green/15'
                : 'bg-gradient-to-br from-app-muted to-app-surface'
            )}
          />
        </div>

        <div
          className="pointer-events-none absolute inset-[10%] rounded-full border border-white/40 dark:border-white/10"
          aria-hidden
        />

        <div
          className={clsx(
            'absolute left-1/2 top-0 z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-sm',
            earned ? 'bg-brand-gold shadow-sm' : 'bg-app-text-muted/40'
          )}
          aria-hidden
        />

        <div
          className={clsx(
            'relative z-10',
            earned ? 'text-brand-green dark:text-brand-green-light' : 'text-app-text-muted'
          )}
        >
          <BadgeIcon icon={icon} size={dims.icon} locked={locked} />
        </div>

        {locked && (
          <div className="absolute inset-0 z-20 grid place-items-center rounded-full bg-app-bg/30" />
        )}
      </div>

      {dims.label && (
        <div
          className={clsx(
            'max-w-[120px] truncate rounded-lg px-2.5 py-1 text-center font-semibold uppercase tracking-wide',
            earned
              ? 'bg-brand-gold/90 text-brand-navy text-[10px] shadow-sm'
              : 'border border-app-border bg-app-surface text-[9px] text-app-text-muted'
          )}
        >
          {label}
        </div>
      )}

      {inProgress && !earned && dims.label && (
        <span className="-mt-1 text-[9px] font-medium text-brand-green">In progress</span>
      )}
    </div>
  );
}
