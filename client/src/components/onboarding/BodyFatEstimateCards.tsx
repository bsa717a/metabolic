import { clsx } from 'clsx';

export type BodyFatEstimateSex = 'male' | 'female';

type BodyFatBand = {
  id: string;
  label: string;
  midpoint: number;
  range: string;
};

const MALE_BANDS: BodyFatBand[] = [
  { id: 'male-bf-8', label: '6-10%', midpoint: 8, range: 'Very lean' },
  { id: 'male-bf-12', label: '10-14%', midpoint: 12, range: 'Lean' },
  { id: 'male-bf-15', label: '14-17%', midpoint: 15, range: 'Fit' },
  { id: 'male-bf-20', label: '17-22%', midpoint: 20, range: 'Average' },
  { id: 'male-bf-25', label: '22-28%', midpoint: 25, range: 'Above avg' },
  { id: 'male-bf-30', label: '28%+', midpoint: 30, range: 'Higher' }
];

const FEMALE_BANDS: BodyFatBand[] = [
  { id: 'female-bf-18', label: '16-20%', midpoint: 18, range: 'Very lean' },
  { id: 'female-bf-22', label: '20-24%', midpoint: 22, range: 'Lean' },
  { id: 'female-bf-25', label: '24-27%', midpoint: 25, range: 'Fit' },
  { id: 'female-bf-30', label: '27-32%', midpoint: 30, range: 'Average' },
  { id: 'female-bf-35', label: '32-38%', midpoint: 35, range: 'Above avg' },
  { id: 'female-bf-40', label: '38%+', midpoint: 40, range: 'Higher' }
];

function SilhouetteIcon({ symbolId, className }: { symbolId: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`/body-fat-estimate/silhouettes.svg#${symbolId}`} />
    </svg>
  );
}

type BodyFatEstimateCardsProps = {
  sex: BodyFatEstimateSex;
  selectedMidpoint?: number;
  onSelect: (midpoint: number) => void;
  className?: string;
};

export function BodyFatEstimateCards({
  sex,
  selectedMidpoint,
  onSelect,
  className
}: BodyFatEstimateCardsProps) {
  const bands = sex === 'male' ? MALE_BANDS : FEMALE_BANDS;

  return (
    <div className={clsx('space-y-3', className)}>
      <p className="text-center text-xs text-app-text-muted">
        Tap the body type that looks closest to you. This is a visual estimate for planning, not a medical measurement — you can update it anytime.
      </p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
        {bands.map((band) => {
          const isSelected = selectedMidpoint === band.midpoint;
          return (
            <button
              key={band.id}
              type="button"
              onClick={() => onSelect(band.midpoint)}
              className={clsx(
                'flex flex-col items-center rounded-xl border-2 p-2 transition-all sm:p-3',
                'hover:border-brand-green/60 hover:bg-brand-green/5',
                'focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:ring-offset-2',
                isSelected
                  ? 'border-brand-green bg-brand-green/10 shadow-sm'
                  : 'border-app-border bg-app-surface'
              )}
              aria-pressed={isSelected}
            >
              <SilhouetteIcon
                symbolId={band.id}
                className={clsx(
                  'h-16 w-10 sm:h-20 sm:w-12',
                  isSelected ? 'text-brand-green' : 'text-app-text-muted'
                )}
              />
              <span
                className={clsx(
                  'mt-1 text-xs font-semibold sm:mt-2 sm:text-sm',
                  isSelected ? 'text-brand-green' : 'text-app-text'
                )}
              >
                {band.label}
              </span>
              <span
                className={clsx(
                  'text-[10px] sm:text-xs',
                  isSelected ? 'text-brand-green/80' : 'text-app-text-muted'
                )}
              >
                {band.range}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type BodyFatEstimateSexGateProps = {
  onSelect: (sex: BodyFatEstimateSex) => void;
  className?: string;
};

export function BodyFatEstimateSexGate({ onSelect, className }: BodyFatEstimateSexGateProps) {
  return (
    <div className={clsx('space-y-3', className)}>
      <p className="text-center text-sm text-app-text-muted">
        Body fat percentages differ by sex. Which set of reference images should I show?
      </p>
      <div className="flex justify-center gap-4">
        <button
          type="button"
          onClick={() => onSelect('male')}
          className="rounded-xl border-2 border-app-border bg-app-surface px-6 py-3 text-sm font-medium text-app-text transition hover:border-brand-green/60 hover:bg-brand-green/5 focus:outline-none focus:ring-2 focus:ring-brand-green/40"
        >
          Men
        </button>
        <button
          type="button"
          onClick={() => onSelect('female')}
          className="rounded-xl border-2 border-app-border bg-app-surface px-6 py-3 text-sm font-medium text-app-text transition hover:border-brand-green/60 hover:bg-brand-green/5 focus:outline-none focus:ring-2 focus:ring-brand-green/40"
        >
          Women
        </button>
      </div>
    </div>
  );
}

