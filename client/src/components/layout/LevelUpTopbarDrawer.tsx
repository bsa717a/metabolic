import type { RefObject } from 'react';
import type { GamificationDashboard } from '../../types/gamification';
import { LevelUpPanel } from '../gamification/LevelUpPanel';
import { TopbarAnchorDrawer } from './TopbarAnchorDrawer';

type LevelUpTopbarDrawerProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  level: NonNullable<GamificationDashboard['currentLevel']>;
};

export function LevelUpTopbarDrawer({ open, onClose, anchorRef, level }: LevelUpTopbarDrawerProps) {
  return (
    <TopbarAnchorDrawer open={open} onClose={onClose} anchorRef={anchorRef} ariaLabel="Level Up">
      <LevelUpPanel level={level} variant="drawer" onClose={onClose} />
    </TopbarAnchorDrawer>
  );
}
