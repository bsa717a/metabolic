import { clsx } from 'clsx';

export function PlannedRestDayCard({
  compact = false,
  fromRoutine = false,
  className
}: {
  compact?: boolean;
  fromRoutine?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center',
        compact ? 'min-h-[5.5rem] px-2 py-3' : 'px-6 py-8',
        className
      )}
    >
      <span className="text-sm font-semibold text-slate-600">Rest day</span>
      {!compact && (
        <span className="mt-1 text-xs text-slate-400">
          {fromRoutine ? 'From your weekly routine' : 'No exercises scheduled'}
        </span>
      )}
    </div>
  );
}
