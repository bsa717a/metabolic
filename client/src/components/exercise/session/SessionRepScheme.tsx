import { clsx } from 'clsx';
import { repSchemeParts } from '../../../utils/repSchemes';

/** Descending scheme strip (15 / 12 / 10) with the upcoming set lit. */
export function SessionRepScheme({
  reps,
  currentSet,
  go = false,
  align = 'center'
}: {
  reps: string | number | null | undefined;
  currentSet: number;
  go?: boolean;
  align?: 'center' | 'start';
}) {
  const parts = repSchemeParts(reps);
  if (parts.length <= 1) return null;
  const highlight = Math.max(0, Math.min(parts.length - 1, currentSet - 1));

  return (
    <p
      className={clsx('flex items-end gap-1.5', align === 'center' ? 'justify-center' : 'justify-start')}
      aria-label={`Next: ${parts[highlight]} reps, set ${currentSet} of ${parts.length}`}
    >
      {parts.map((count, index) => {
        const active = index === highlight;
        return (
          <span key={`${count}-${index}`} className="flex items-end gap-1.5">
            {index > 0 && (
              <span className={clsx('pb-1 text-xl font-medium', go ? 'text-white/40' : 'text-white/25')}>
                /
              </span>
            )}
            <span
              className={clsx(
                'tabular-nums leading-none',
                active
                  ? go
                    ? 'text-5xl font-black text-white'
                    : 'text-5xl font-black text-white'
                  : go
                    ? 'text-2xl font-semibold text-white/45'
                    : 'text-2xl font-semibold text-white/35'
              )}
            >
              {count}
            </span>
          </span>
        );
      })}
    </p>
  );
}
