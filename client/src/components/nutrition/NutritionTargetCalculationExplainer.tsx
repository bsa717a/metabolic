import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { NutritionTargetFormulaBreakdown, NutritionTargetSource } from '../../types';
import {
  FORMULA_STEP_CITATIONS,
  NOT_MEDICAL_ADVICE,
  OTHER_METHODOLOGY
} from '../../content/nutritionSources';
import { CitationLink } from './CitationLink';

const SOURCE_NOTE: Partial<Record<NutritionTargetSource, string>> = {
  OVERRIDE_BAND:
    'Your effective targets come from a nutritionist-defined profile band. The steps below show how the automatic Mifflin-St Jeor formula would calculate targets from your profile.',
  COACH:
    'You have custom macro overrides in effect. Blank fields still use the automatic calculation shown below.',
  TEMPLATE: 'Your plan uses template targets. The steps below show the automatic formula from your profile.'
};

function MethodologyDetails() {
  return (
    <div className="space-y-3 border-t border-app-border pt-3">
      <p className="font-semibold text-app-text">Sources</p>
      <p>{NOT_MEDICAL_ADVICE}</p>
      {OTHER_METHODOLOGY.map((note) => (
        <div key={note.title}>
          <p className="font-semibold text-app-text">{note.title}</p>
          <p className="mt-0.5">{note.plain}</p>
          {note.citation ? <CitationLink citation={note.citation} /> : null}
        </div>
      ))}
    </div>
  );
}

export function NutritionTargetCalculationExplainer({
  breakdown,
  source,
  startExpanded = false
}: {
  breakdown: NutritionTargetFormulaBreakdown | null;
  source: NutritionTargetSource | null;
  /** Sources page opens this section already expanded. */
  startExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(startExpanded);

  const sourceNote = source && source !== 'FORMULA' ? SOURCE_NOTE[source] : null;

  return (
    <div id="how-targets-are-calculated" className="rounded-xl border border-app-border bg-app-surface">
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
          {!breakdown ? (
            <p>Add gender, height, and weight to your profile to see how automatic targets are calculated.</p>
          ) : (
            <>
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
                {breakdown.steps.map((step) => {
                  const cited = FORMULA_STEP_CITATIONS[step.title];
                  return (
                    <li key={step.title}>
                      <p className="font-semibold text-app-text">{step.title}</p>
                      <p className="mt-0.5 tabular-nums">{step.detail}</p>
                      {cited ? (
                        <>
                          <p className="mt-1">{cited.plain}</p>
                          <CitationLink citation={cited.citation} />
                        </>
                      ) : null}
                    </li>
                  );
                })}
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
            </>
          )}

          <MethodologyDetails />
        </div>
      ) : null}
    </div>
  );
}
