import { createPortal } from 'react-dom';

export function ExercisePlanUndoToast({
  message,
  restoring,
  onUndo,
  onDismiss
}: {
  message: string | null;
  restoring: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  if (!message) return null;

  return createPortal(
    <div className="fixed bottom-6 left-1/2 z-[70] flex max-w-md -translate-x-1/2 items-center justify-between gap-4 rounded-2xl bg-slate-800 px-4 py-3 text-sm text-white shadow-lg ring-1 ring-white/10">
      <span>{message}</span>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          className="font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
          disabled={restoring}
          onClick={() => void onUndo()}
        >
          {restoring ? 'Restoring…' : 'Undo'}
        </button>
        <button
          type="button"
          className="text-slate-400 hover:text-slate-200"
          disabled={restoring}
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>,
    document.body
  );
}
