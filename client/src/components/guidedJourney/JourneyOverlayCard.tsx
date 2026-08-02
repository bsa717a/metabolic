import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

/**
 * Compact parchment panel that floats inside the world.
 * No backdrop-blur — landscape stays sharp through translucent tones.
 */
export function JourneyOverlayCard({
  className,
  tone = 'cream',
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: 'cream' | 'mist' | 'clear' }) {
  return (
    <div
      className={clsx(
        'rounded-2xl p-4 sm:p-5',
        tone === 'cream' &&
          'border border-[color-mix(in_oklab,var(--app-border)_70%,transparent)] bg-app-surface shadow-[0_12px_40px_rgba(31,41,51,0.14)]',
        tone === 'mist' &&
          'border border-white/45 bg-[color-mix(in_oklab,var(--app-surface)_52%,transparent)] shadow-[0_16px_48px_rgba(31,41,51,0.12)] dark:border-white/15 dark:bg-[color-mix(in_oklab,var(--app-surface)_45%,transparent)]',
        tone === 'clear' && 'bg-transparent',
        className
      )}
      {...props}
    />
  );
}
