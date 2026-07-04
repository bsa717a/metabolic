export function ProgressRing({
  percent,
  size = 64,
  showLabel = true,
  label,
  labelClassName
}: {
  percent: number;
  size?: number;
  showLabel?: boolean;
  label?: string;
  labelClassName?: string;
}) {
  const stroke = Math.max(3, Math.round(size / 12));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const labelText = label ?? `${percent}%`;
  const labelSize = label ? Math.round(size * 0.38) : size < 48 ? 9 : 11;
  const useHtmlLabel = Boolean(label);

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden={!showLabel}
    >
      <svg width={size} height={size} className="shrink-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-app-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-brand-green transition-all duration-500"
        />
        {showLabel && !useHtmlLabel && (
          <text
            x={size / 2}
            y={size / 2}
            dominantBaseline="central"
            textAnchor="middle"
            className={
              labelClassName ?? 'fill-brand-navy dark:fill-brand-off-white font-semibold rotate-90'
            }
            style={{ fontSize: labelSize, transformOrigin: 'center' }}
          >
            {labelText}
          </text>
        )}
      </svg>
      {showLabel && useHtmlLabel && (
        <span
          className={
            labelClassName ??
            'absolute inset-0 flex items-center justify-center font-semibold text-brand-navy dark:text-brand-off-white'
          }
          style={{ fontSize: labelSize, lineHeight: 1 }}
        >
          {labelText}
        </span>
      )}
    </span>
  );
}
