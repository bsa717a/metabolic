import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';

function HabitRing({
  percent,
  color
}: {
  percent: number;
  color: string;
}) {
  const size = 56;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percent, 0), 100);
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <span className="relative inline-flex size-14 shrink-0 items-center justify-center" aria-hidden>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--app-progress-track)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function HabitCard({
  label,
  value,
  detail,
  percent,
  color,
  icon: Icon,
  onClick
}: {
  label: string;
  value: string;
  detail: string;
  percent: number;
  color: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col rounded-2xl border border-app-border bg-app-surface p-3 text-left shadow-sm transition hover:border-brand-green/40"
    >
      <span className="relative mx-auto">
        <HabitRing percent={percent} color={color} />
        <span className="absolute inset-0 grid place-items-center">
          <Icon size={18} style={{ color }} aria-hidden />
        </span>
      </span>
      <p className="mt-2 text-center text-sm font-semibold text-app-text">{value}</p>
      <span
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-app-muted"
        aria-hidden
      >
        <span
          className={clsx('block h-full rounded-full transition-all')}
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%`, backgroundColor: color }}
        />
      </span>
      <p className="mt-1 text-center text-[11px] text-app-text-muted">{detail}</p>
      <span className="sr-only">{label}</span>
    </button>
  );
}
