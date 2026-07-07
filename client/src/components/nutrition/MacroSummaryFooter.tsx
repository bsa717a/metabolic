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
          <p className="text-sm font-bold tabular-nums text-app-text">
            {actual}
            {unit ?? ''}
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
