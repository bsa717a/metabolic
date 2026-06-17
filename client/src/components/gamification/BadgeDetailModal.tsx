import { Modal } from '../ui/Modal';
import { AchievementBadgeMedal } from './AchievementBadgeMedal';
import { resolveBadgeDisplay } from './badgeDisplay';
import type { UserBadgeView } from '../../types/gamification';

function formatEarnedAt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function BadgeDetailModal({
  badge,
  onClose
}: {
  badge: UserBadgeView | null;
  onClose: () => void;
}) {
  if (!badge) return null;

  const { earned, inProgress, locked } = resolveBadgeDisplay(badge.status);

  return (
    <Modal open={true} onClose={onClose} title={badge.name}>
      <div className="flex flex-col items-center gap-6 text-center">
        <div key={badge.id} className="animate-badge-zoom-spin">
          <AchievementBadgeMedal
            badgeId={badge.id}
            name={badge.name}
            icon={badge.icon}
            size="xl"
            status={badge.status}
          />
        </div>

        <div className="animate-badge-content-rise space-y-2">
          {badge.tier && (
            <p className="text-sm font-medium capitalize text-app-text-muted">{badge.tier.toLowerCase()} tier</p>
          )}
          <p className="text-sm text-app-text-muted">{badge.description}</p>
        </div>

        {earned && badge.earnedAt ? (
          <div className="animate-badge-content-rise w-full rounded-xl bg-brand-gold/10 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-gold">Accomplished</p>
            <p className="mt-1 text-sm font-medium text-brand-navy dark:text-brand-off-white">
              {formatEarnedAt(badge.earnedAt)}
            </p>
          </div>
        ) : inProgress ? (
          <p className="animate-badge-content-rise text-sm font-medium text-brand-green">
            {badge.progress} of {badge.threshold} complete
          </p>
        ) : locked ? (
          <p className="animate-badge-content-rise text-sm text-app-text-muted">Not earned yet — keep going!</p>
        ) : null}
      </div>
    </Modal>
  );
}
