import { clsx } from 'clsx';

export function Drawer({
  open,
  title,
  children,
  onClose,
  panelClassName
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  panelClassName?: string;
}) {
  return (
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
        <div className="mb-6 flex shrink-0 items-center justify-between">
          <h2 className="text-xl font-bold text-app-text">{title}</h2>
          <button type="button" className="text-app-text-muted transition hover:text-app-text" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-visible">{children}</div>
      </aside>
    </div>
  );
}
