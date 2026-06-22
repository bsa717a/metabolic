import { clsx } from 'clsx';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

type TopbarAnchorDrawerProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
  ariaLabel: string;
  children: ReactNode;
  panelClassName?: string;
};

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isMobile;
}

export function TopbarAnchorDrawer({
  open,
  onClose,
  anchorRef,
  ariaLabel,
  children,
  panelClassName = 'w-[min(calc(100vw-1.5rem),22rem)] max-h-[min(70vh,32rem)]'
}: TopbarAnchorDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [anchorCenterX, setAnchorCenterX] = useState(0);
  const isMobile = useIsMobileViewport();

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setTop(rect.bottom + 8);
      setAnchorCenterX(rect.left + rect.width / 2);
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/20" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className={clsx(
          'fixed z-50 origin-top -translate-x-1/2 overflow-y-auto rounded-2xl border border-app-border bg-app-surface p-4 shadow-2xl',
          panelClassName
        )}
        style={{ top, left: isMobile ? '50%' : anchorCenterX }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </>,
    document.body
  );
}
