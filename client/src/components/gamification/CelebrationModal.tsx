import { Link } from 'react-router-dom';
import { Award, Sparkles } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { GamificationCelebration } from '../../types/gamification';

export function CelebrationModal({
  celebration,
  onClose
}: {
  celebration: GamificationCelebration | null;
  onClose: () => void;
}) {
  if (!celebration) return null;

  const isLevel = celebration.type === 'level_complete';

  return (
    <Modal open={true} onClose={onClose} title={isLevel ? 'Level complete' : 'Badge earned'}>
      <div className="space-y-4 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-green/15 text-brand-green">
          {isLevel ? <Sparkles size={32} /> : <Award size={32} />}
        </div>
        {isLevel ? (
          <>
            <p className="text-lg font-semibold text-brand-navy dark:text-brand-off-white">
              {celebration.levelName}
            </p>
            <p className="text-sm text-app-text-muted">{celebration.completionMessage}</p>
            {celebration.nextLevelName && (
              <div className="rounded-xl border border-app-border bg-app-muted/50 p-4 text-left">
                <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Next up</p>
                <p className="mt-1 font-semibold">{celebration.nextLevelName}</p>
              </div>
            )}
            <Link to="/level-up/path" onClick={onClose}>
              <Button className="w-full">
                {celebration.nextLevelName ? `Start ${celebration.nextLevelName}` : 'View level path'}
              </Button>
            </Link>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold">{celebration.badgeName}</p>
            <p className="text-sm text-app-text-muted">{celebration.badgeDescription}</p>
            <Link to="/level-up/badges" onClick={onClose}>
              <Button variant="secondary" className="w-full">
                View badge
              </Button>
            </Link>
          </>
        )}
      </div>
    </Modal>
  );
}
