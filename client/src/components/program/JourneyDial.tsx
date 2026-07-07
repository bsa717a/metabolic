import { progressToGoal } from '../../utils/journeyDialUtils';

function MiniStat({ label, value, tone }: { label: string; value: string; tone: 'start' | 'current' | 'goal' }) {
  const styles = {
    start: 'bg-amber-50/80 text-amber-800',
    current: 'bg-blue-50 text-blue-700 ring-1 ring-blue-300',
    goal: 'bg-rose-50/80 text-rose-600'
  } as const;

  return (
    <div className={`rounded px-1 py-1 text-center ${styles[tone]}`}>
      <p className="text-[15px] font-semibold tabular-nums leading-tight">{value}</p>
      <p className="text-xs font-medium uppercase leading-tight text-app-text-muted">{label}</p>
    </div>
  );
}

export function JourneyDial({
  id,
  label,
  start,
  current,
  goal,
  formatValue,
  unit
}: {
  id: string;
  label: string;
  start: number;
  current: number;
  goal: number;
  formatValue: (value: number, unit: string) => string;
  unit: string;
}) {
  const progress = progressToGoal(start, current, goal);
  const radius = 72;
  const stroke = 11;
  const size = 180;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (progress / 100) * circumference;
  const knobAngle = -Math.PI / 2 + (progress / 100) * 2 * Math.PI;
  const knobX = center + radius * Math.cos(knobAngle);
  const knobY = center + radius * Math.sin(knobAngle);
  const gradientId = `journey-gradient-${id}`;

  return (
    <div className="flex min-w-0 flex-col items-stretch">
      <p className="mb-1.5 text-center text-[18px] font-semibold uppercase tracking-[0.12em] text-app-text-muted">
        {label}
      </p>

      <div className="relative mx-auto w-full max-w-[11.25rem]">
        <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto block w-full" aria-hidden>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#9a8468" />
            </linearGradient>
          </defs>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--app-progress-track, #e2e8f0)"
            strokeWidth={stroke}
            opacity={0.55}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
          <circle cx={knobX} cy={knobY} r={7} fill="white" stroke="#3b82f6" strokeWidth={3} />
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
          <p className="text-3xl font-bold tabular-nums leading-none text-brand-navy dark:text-brand-off-white">
            {formatValue(current, unit)}
          </p>
          <p className="mt-1 text-[22.5px] font-bold text-blue-600 dark:text-blue-400">{progress}%</p>
        </div>
      </div>

      <div className="mt-1 grid w-[12.75rem] max-w-full grid-cols-3 gap-px self-center">
        <MiniStat label="Start" value={formatValue(start, unit)} tone="start" />
        <MiniStat label="Now" value={formatValue(current, unit)} tone="current" />
        <MiniStat label="Goal" value={formatValue(goal, unit)} tone="goal" />
      </div>
    </div>
  );
}
