import { useId } from 'react';

type WaterBottleProps = {
  fillFraction: number;
  size?: 'sm' | 'md' | 'lg';
  goalMet?: boolean;
  targetOz?: number;
  className?: string;
};

const SIZE_MAP = {
  sm: { width: 30, height: 54 },
  md: { width: 56, height: 88 },
  lg: { width: 96, height: 152 }
} as const;

const TICK_FRACTIONS = [0.25, 0.5, 0.75] as const;

export function WaterBottle({
  fillFraction,
  size = 'md',
  goalMet = false,
  targetOz = 64,
  className = ''
}: WaterBottleProps) {
  const uid = useId().replace(/:/g, '');
  const { width, height } = SIZE_MAP[size];
  const clampedFill = Math.max(0, Math.min(1, fillFraction));
  const gradientId = `waterGradient-${uid}`;
  const clipId = `waterClip-${uid}`;
  const logoClipId = `logoClip-${uid}`;

  const capWidth = width * 0.52;
  const capHeight = height * 0.09;
  const capX = (width - capWidth) / 2;
  const capY = height * 0.02;

  const bodyX = width * 0.14;
  const bodyY = height * 0.13;
  const bodyWidth = width * 0.72;
  const bodyHeight = height * 0.8;
  const bodyRadius = width * 0.1;

  const innerPadding = width * 0.05;
  const innerX = bodyX + innerPadding;
  const innerY = bodyY + innerPadding;
  const innerWidth = bodyWidth - innerPadding * 2;
  const innerHeight = bodyHeight - innerPadding * 1.6;
  const innerBottom = innerY + innerHeight;
  const waterY = innerBottom - innerHeight * clampedFill;
  const waterHeight = innerBottom - waterY;

  const strokeWidth = Math.max(1.25, width * 0.04);
  const showTicks = size !== 'sm';
  const showLogo = size !== 'sm';
  const showLogoLabel = size === 'lg';
  const logoSize = size === 'md' ? width * 0.38 : width * 0.42;
  const logoX = width * 0.5 - logoSize / 2;
  const logoY = bodyY + bodyHeight * 0.28;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect
            x={innerX}
            y={innerY}
            width={innerWidth}
            height={innerHeight}
            rx={width * 0.06}
          />
        </clipPath>
        <clipPath id={logoClipId}>
          <rect
            x={bodyX + bodyWidth * 0.12}
            y={bodyY + bodyHeight * 0.18}
            width={bodyWidth * 0.76}
            height={bodyHeight * 0.52}
            rx={width * 0.04}
          />
        </clipPath>
      </defs>

      {goalMet && (
        <rect
          x={bodyX - width * 0.04}
          y={bodyY - width * 0.03}
          width={bodyWidth + width * 0.08}
          height={bodyHeight + width * 0.06}
          rx={bodyRadius + width * 0.03}
          fill="none"
          stroke="#e2c26e"
          strokeWidth={Math.max(1, width * 0.035)}
          opacity={0.9}
        />
      )}

      <rect
        x={capX}
        y={capY}
        width={capWidth}
        height={capHeight}
        rx={width * 0.03}
        fill="#7da35d"
      />
      {[0.28, 0.5, 0.72].map((offset) => (
        <line
          key={offset}
          x1={capX + capWidth * offset}
          x2={capX + capWidth * offset}
          y1={capY + capHeight * 0.22}
          y2={capY + capHeight * 0.78}
          stroke="#6d8f52"
          strokeWidth={Math.max(0.75, width * 0.018)}
          opacity={0.7}
        />
      ))}

      <rect
        x={bodyX}
        y={bodyY}
        width={bodyWidth}
        height={bodyHeight}
        rx={bodyRadius}
        fill="currentColor"
        className="text-white/70 dark:text-white/10"
      />
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyWidth}
        height={bodyHeight}
        rx={bodyRadius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-brand-navy dark:text-brand-off-white"
      />

      <rect
        x={bodyX + bodyWidth * 0.14}
        y={bodyY + bodyHeight * 0.1}
        width={bodyWidth * 0.06}
        height={bodyHeight * 0.65}
        rx={width * 0.02}
        fill="#ffffff"
        opacity={0.28}
      />

      {showTicks &&
        TICK_FRACTIONS.map((fraction) => {
          const oz = Math.round(targetOz * fraction);
          const y = innerBottom - innerHeight * fraction;
          return (
            <g key={fraction} opacity={0.5}>
              <line
                x1={bodyX + bodyWidth * 0.06}
                x2={bodyX + bodyWidth * (size === 'lg' ? 0.2 : 0.16)}
                y1={y}
                y2={y}
                stroke="currentColor"
                strokeWidth={Math.max(0.75, width * 0.02)}
                className="text-brand-navy dark:text-brand-off-white"
              />
              {size === 'lg' && (
                <text
                  x={bodyX + bodyWidth * 0.22}
                  y={y + 3}
                  fontSize={7}
                  fill="currentColor"
                  className="text-app-text-muted"
                >
                  {oz}
                </text>
              )}
            </g>
          );
        })}

      <g clipPath={`url(#${clipId})`}>
        {waterHeight > 0 && (
          <>
            <rect
              x={innerX}
              y={waterY}
              width={innerWidth}
              height={waterHeight}
              fill={`url(#${gradientId})`}
              opacity={0.92}
            />
            <ellipse
              cx={width * 0.5}
              cy={waterY}
              rx={innerWidth * 0.46}
              ry={Math.max(2, width * 0.04)}
              fill="#38bdf8"
              opacity={0.88}
            />
          </>
        )}
      </g>

      {showLogo && (
        <g clipPath={`url(#${logoClipId})`}>
          <rect
            x={logoX - width * 0.02}
            y={logoY - width * 0.02}
            width={logoSize + width * 0.04}
            height={logoSize + (showLogoLabel ? width * 0.14 : width * 0.04)}
            rx={width * 0.04}
            fill="#ffffff"
            opacity={0.82}
          />
          <image
            href="/logo.png"
            x={logoX}
            y={logoY}
            width={logoSize}
            height={logoSize}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      )}

      {showLogoLabel && (
        <text
          x={width * 0.5}
          y={logoY + logoSize + 8}
          textAnchor="middle"
          fontSize={8}
          fontWeight={600}
          fill="currentColor"
          className="text-brand-navy dark:text-brand-off-white"
        >
          Metabolic OS
        </text>
      )}
    </svg>
  );
}

export function waterFillFraction(targetOz: number, actualOz: number) {
  if (targetOz <= 0) return 0;
  return Math.max(0, Math.min(1, (targetOz - actualOz) / targetOz));
}
