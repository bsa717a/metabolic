import type { RefObject } from 'react';
import { HydrationPanel } from './HydrationPanel';
import { TopbarAnchorDrawer } from '../layout/TopbarAnchorDrawer';

type HydrationTopbarDrawerProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
};

export function HydrationTopbarDrawer({ open, onClose, anchorRef }: HydrationTopbarDrawerProps) {
  return (
    <TopbarAnchorDrawer open={open} onClose={onClose} anchorRef={anchorRef} ariaLabel="Hydration">
      <HydrationPanel variant="drawer" onClose={onClose} />
    </TopbarAnchorDrawer>
  );
}
