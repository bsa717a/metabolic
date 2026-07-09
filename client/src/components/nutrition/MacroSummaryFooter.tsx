export type MacroTotals = { calories: number; protein: number; carbs: number; fat: number };

function mealGoalShareOfDay(mealGoals: MacroTotals, dailyGoals: MacroTotals): number | null {
  const shares = ([
    ['calories', mealGoals.calories, dailyGoals.calories],
    ['protein', mealGoals.protein, dailyGoals.protein],
    ['carbs', mealGoals.carbs, dailyGoals.carbs],
    ['fat', mealGoals.fat, dailyGoals.fat]
  ] as const)
    .map(([, meal, daily]) => (daily > 0 ? (meal / daily) * 100 : null))
    .filter((value): value is number => value != null);

  if (!shares.length) return null;
  return Math.round(shares.reduce((sum, value) => sum + value, 0) / shares.length);
}

/** Actual (green) / Planned (gold, bold) / Goal (muted). */
function MacroTriple({
  actual,
  planned,
  goal,
  suffix
}: {
  actual: number;
  planned: number;
  goal: number;
  suffix: string;
}) {
  return (
    <>
      <span className="font-semibold text-brand-green">{actual}</span>
      <span className="text-app-text-muted"> / </span>
      <span className="font-bold text-amber-700 dark:text-brand-gold">{planned}</span>
      <span className="text-app-text-muted">
        {' '}
        / {goal}
        {suffix}
      </span>
    </>
  );
}

function MacroPair({ actual, goal, suffix }: { actual: number; goal: number; suffix: string }) {
  return (
    <>
      <span className="font-bold text-app-text">{actual}</span>
      <span>
        {' '}
        / {goal}
        {suffix}
      </span>
    </>
  );
}

export function formatMacroSummaryInline(totals: MacroTotals, targets: MacroTotals) {
  return [
    `${totals.calories} / ${targets.calories} kcal`,
    `${totals.protein} / ${targets.protein}g P`,
    `${totals.carbs} / ${targets.carbs}g C`,
    `${totals.fat} / ${targets.fat}g F`
  ].join(' · ');
}

export function formatMacroTotalsInline(totals: MacroTotals) {
  return `${totals.calories} kcal · ${totals.protein}g P · ${totals.carbs}g C · ${totals.fat}g F`;
}

export function MacroSummaryInline({
  totals,
  planned,
  targets,
  dailyTargets,
  className = 'text-sm tabular-nums text-app-text-muted'
}: {
  /** When `planned` is set, this is treated as actual intake. Otherwise legacy planned-or-single totals. */
  totals: MacroTotals;
  planned?: MacroTotals;
  targets: MacroTotals;
  dailyTargets?: MacroTotals | null;
  className?: string;
}) {
  const dayShare = dailyTargets ? mealGoalShareOfDay(targets, dailyTargets) : null;
  const showTriple = Boolean(planned);

  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 ${className}`}>
      <p className="min-w-0">
        {showTriple && planned ? (
          <>
            <MacroTriple
              actual={totals.calories}
              planned={planned.calories}
              goal={targets.calories}
              suffix=" kcal"
            />
            <span> · </span>
            <MacroTriple
              actual={totals.protein}
              planned={planned.protein}
              goal={targets.protein}
              suffix="g P"
            />
            <span> · </span>
            <MacroTriple
              actual={totals.carbs}
              planned={planned.carbs}
              goal={targets.carbs}
              suffix="g C"
            />
            <span> · </span>
            <MacroTriple
              actual={totals.fat}
              planned={planned.fat}
              goal={targets.fat}
              suffix="g F"
            />
          </>
        ) : (
          <>
            <MacroPair actual={totals.calories} goal={targets.calories} suffix=" kcal" />
            <span> · </span>
            <MacroPair actual={totals.protein} goal={targets.protein} suffix="g P" />
            <span> · </span>
            <MacroPair actual={totals.carbs} goal={targets.carbs} suffix="g C" />
            <span> · </span>
            <MacroPair actual={totals.fat} goal={targets.fat} suffix="g F" />
          </>
        )}
        {dayShare != null && <span> · {dayShare}% day</span>}
      </p>
      {showTriple ? (
        <p className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-app-text-muted">
          <span className="text-brand-green">Actual</span>
          <span> / </span>
          <span className="text-amber-700 dark:text-brand-gold">Planned</span>
          <span> / </span>
          <span>Goal</span>
        </p>
      ) : null}
    </div>
  );
}

export function MacroTotalsInline({
  totals,
  className = 'text-sm tabular-nums text-app-text-muted'
}: {
  totals: MacroTotals;
  className?: string;
}) {
  return (
    <p className={className}>
      <span className="font-bold text-amber-700 dark:text-brand-gold">{totals.calories}</span>
      <span> kcal · </span>
      <span className="font-bold text-amber-700 dark:text-brand-gold">{totals.protein}</span>
      <span>g P · </span>
      <span className="font-bold text-amber-700 dark:text-brand-gold">{totals.carbs}</span>
      <span>g C · </span>
      <span className="font-bold text-amber-700 dark:text-brand-gold">{totals.fat}</span>
      <span>g F</span>
    </p>
  );
}

export function MacroSummaryFooter({
  totals,
  targets,
  dailyTargets
}: {
  totals: MacroTotals;
  targets: MacroTotals;
  dailyTargets?: MacroTotals | null;
}) {
  const rows: Array<{ label: string; actual: number; target: number; unit?: string }> = [
    { label: 'Kcal', actual: totals.calories, target: targets.calories },
    { label: 'Protein', actual: totals.protein, target: targets.protein, unit: 'g' },
    { label: 'Carbs', actual: totals.carbs, target: targets.carbs, unit: 'g' },
    { label: 'Fat', actual: totals.fat, target: targets.fat, unit: 'g' }
  ];
  const dayShare = dailyTargets ? mealGoalShareOfDay(targets, dailyTargets) : null;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
      {rows.map(({ label, actual, target, unit }) => (
        <div key={label}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-app-text-muted">{label}</p>
          <p className="text-sm tabular-nums text-app-text">
            <span className="font-bold text-amber-700 dark:text-brand-gold">
              {actual}
              {unit ?? ''}
            </span>
            <span className="text-xs font-semibold text-app-text-muted">
              {' '}
              / {target}
              {unit ?? ''}
            </span>
          </p>
        </div>
      ))}
      {dailyTargets && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-app-text-muted">% Day</p>
          <p className="text-sm font-bold tabular-nums text-app-text">{dayShare != null ? `${dayShare}%` : '—'}</p>
        </div>
      )}
    </div>
  );
}
