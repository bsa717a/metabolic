import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { NutritionTargetFormulaBreakdown, NutritionTargetSource } from '../../types';

const SOURCE_NOTE: Partial<Record<NutritionTargetSource, string>> = {
  OVERRIDE_BAND:
    'Your effective targets come from a nutritionist-defined profile band. The steps below show how the automatic Mifflin-St Jeor formula would calculate targets from your profile.',
  COACH:
    'You have custom macro overrides in effect. Blank fields still use the automatic calculation shown below.',
  TEMPLATE: 'Your plan uses template targets. The steps below show the automatic formula from your profile.'
};

export function NutritionTargetCalculationExplainer({
  breakdown,
  source
}: {
  breakdown: NutritionTargetFormulaBreakdown | null;
  source: NutritionTargetSource | null;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!breakdown) {
    return (
      <p className="text-xs text-app-text-muted">
        Add gender, height, and weight to your profile to see how automatic targets are calculated.
      </p>
    );
  }

  const sourceNote = source && source !== 'FORMULA' ? SOURCE_NOTE[source] : null;

  return (
    <div className="rounded-xl border border-app-border bg-app-surface">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
      >
        <span className="min-w-0 flex-1 text-sm font-medium text-brand-navy dark:text-brand-off-white">
          How are these calculated?
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-app-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-app-border px-3 py-3 text-xs text-app-text-muted">
          <p>
            Automatic targets use the <strong className="font-semibold text-app-text">Mifflin-St Jeor</strong> BMR
            formula with your profile:
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            <li>{breakdown.profile.genderLabel}</li>
            <li>{breakdown.profile.heightLabel} tall</li>
            <li>{breakdown.profile.weightLbs} lb</li>
            <li>
              Age {breakdown.profile.ageYears}
              {breakdown.profile.ageIsEstimated ? ' (estimated)' : ''}
            </li>
            <li className="sm:col-span-2">
              Activity level {breakdown.profile.activityLevel} — {breakdown.profile.activityLabel}
            </li>
          </ul>

          {sourceNote ? <p>{sourceNote}</p> : null}

          <ol className="space-y-2">
            {breakdown.steps.map((step) => (
              <li key={step.title}>
                <p className="font-semibold text-app-text">{step.title}</p>
                <p className="mt-0.5 tabular-nums">{step.detail}</p>
              </li>
            ))}
          </ol>

          <p className="font-semibold text-app-text">
            Formula result: {breakdown.result.calories.toLocaleString()} kcal · {breakdown.result.protein} g protein ·{' '}
            {breakdown.result.carbs} g carbs · {breakdown.result.fat} g fat
          </p>

          {breakdown.adjustments.length > 0 ? (
            <ul className="space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
              {breakdown.adjustments.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
