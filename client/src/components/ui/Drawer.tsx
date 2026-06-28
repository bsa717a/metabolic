import { clsx } from 'clsx';
import { createPortal } from 'react-dom';

export function Drawer({
  open,
  title,
  children,
  onClose,
  headerActions,
  showClose = true,
  panelClassName
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  headerActions?: React.ReactNode;
  showClose?: boolean;
  panelClassName?: string;
}) {
  // Render in a portal on document.body so the fixed overlay isn't trapped by an
  // ancestor that establishes a containing block for fixed descendants (e.g. the
  // header's backdrop-filter / transform).
  return createPortal(
    <div className={clsx('fixed inset-0 z-50 transition', open ? 'pointer-events-auto' : 'pointer-events-none')}>
      <div
        className={clsx('absolute inset-0 bg-slate-950/30 transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <aside
        className={clsx(
          'absolute right-0 top-0 flex h-full w-full flex-col bg-app-surface p-6 text-app-text shadow-2xl transition-transform',
          panelClassName ?? 'max-w-md',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="mb-6 flex shrink-0 items-start justify-between gap-3">
          <h2 className="min-w-0 text-xl font-bold text-app-text">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            {showClose ? (
              <button type="button" className="text-app-text-muted transition hover:text-app-text" onClick={onClose}>
                Close
              </button>
            ) : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible">{children}</div>
      </aside>
    </div>,
    document.body
  );
}
