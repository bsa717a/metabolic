type WaterBottleProps = {
  fillFraction: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const SIZE_MAP = {
  sm: { width: 30, height: 54 },
  md: { width: 56, height: 88 },
  lg: { width: 96, height: 152 }
} as const;

export function WaterBottle({ fillFraction, size = 'md', className = '' }: WaterBottleProps) {
  const { width, height } = SIZE_MAP[size];
  const clampedFill = Math.max(0, Math.min(1, fillFraction));
  const waterHeight = Math.round(height * 0.58 * clampedFill);
  const innerTop = height * 0.28;
  const innerBottom = height * 0.86;
  const innerHeight = innerBottom - innerTop;
  const waterY = innerBottom - (innerHeight * clampedFill);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={`waterGradient-${size}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>
      <rect
        x={width * 0.34}
        y={height * 0.08}
        width={width * 0.32}
        height={height * 0.12}
        rx={width * 0.06}
        fill="currentColor"
        className="text-app-text-muted/40"
      />
      <rect
        x={width * 0.22}
        y={innerTop}
        width={width * 0.56}
        height={innerHeight}
        rx={width * 0.18}
        fill="none"
        stroke="currentColor"
        strokeWidth={Math.max(1.5, width * 0.05)}
        className="text-app-text-muted"
      />
      {waterHeight > 0 && (
        <rect
          x={width * 0.26}
          y={waterY}
          width={width * 0.48}
          height={innerBottom - waterY}
          rx={width * 0.14}
          fill={`url(#waterGradient-${size})`}
        />
      )}
      <ellipse
        cx={width * 0.5}
        cy={waterY || innerBottom}
        rx={width * 0.24}
        ry={Math.max(2, width * 0.05)}
        fill={clampedFill > 0 ? '#38bdf8' : 'transparent'}
        opacity={clampedFill > 0 ? 0.85 : 0}
      />
    </svg>
  );
}

export function waterFillFraction(targetOz: number, actualOz: number) {
  if (targetOz <= 0) return 0;
  return Math.max(0, Math.min(1, (targetOz - actualOz) / targetOz));
}
