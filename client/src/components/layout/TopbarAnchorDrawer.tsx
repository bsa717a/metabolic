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

export function TopbarAnchorDrawer({
  open,
  onClose,
  anchorRef,
  ariaLabel,
  children,
  panelClassName = 'w-[min(calc(100vw-1.5rem),22rem)] max-h-[min(70vh,32rem)]'
}: TopbarAnchorDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: rect.left + rect.width / 2
      });
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
        className={`fixed z-50 -translate-x-1/2 origin-top overflow-y-auto rounded-2xl border border-app-border bg-app-surface p-4 shadow-2xl ${panelClassName}`}
        style={{ top: position.top, left: position.left }}
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
