import { Card } from '../ui/Card';
import type { Dashboard } from '../../types';
import { SourcesBesideTargets } from '../nutrition/SourcesLink';

export function MacroProgress({ dashboard }: { dashboard: Dashboard }) {
  const log = dashboard.dailyLog;
  const rows = log
    ? [
        ['Calories', log.caloriesActual, log.calorieTarget],
        ['Protein', log.proteinActual, log.proteinTarget],
        ['Carbs', log.carbsActual, log.carbTarget],
        ['Fat', log.fatActual, log.fatTarget]
      ]
    : [];

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-brand-navy dark:text-brand-off-white">Macro Status</h2>
        <SourcesBesideTargets />
      </div>
      <div className="space-y-4">
        {rows.map(([label, actual, target]) => (
          <div key={label as string}>
            <div className="mb-1 flex justify-between text-sm text-app-text">
              <span>{label as string}</span>
              <span className="text-app-text-muted">
                {Math.round(Number(actual))} / {Math.round(Number(target))}
              </span>
            </div>
            <div className="h-3 rounded-full bg-[var(--app-progress-track)]">
              <div
                className="h-3 rounded-full bg-brand-green dark:bg-brand-green-light"
                style={{ width: `${Math.min((Number(actual) / Number(target)) * 100, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
