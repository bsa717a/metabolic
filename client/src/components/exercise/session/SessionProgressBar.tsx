import { clsx } from 'clsx';

/** Slim "N of M" progress dots across the top of the guided session. */
export function SessionProgressBar({
  total,
  currentIndex,
  completedCount
}: {
  total: number;
  currentIndex: number;
  completedCount: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        {Array.from({ length: total }).map((_, index) => (
          <span
            key={index}
            className={clsx(
              'h-1.5 flex-1 rounded-full transition-colors',
              index < completedCount
                ? 'bg-emerald-500'
                : index === currentIndex
                  ? 'bg-emerald-300'
                  : 'bg-white/20'
            )}
          />
        ))}
      </div>
      <p className="text-xs font-medium text-white/60">
        Exercise {Math.min(currentIndex + 1, total)} of {total}
      </p>
    </div>
  );
}
