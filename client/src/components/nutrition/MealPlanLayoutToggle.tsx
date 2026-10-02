import { clsx } from 'clsx';
import type { MealPlanLayout } from '../../utils/mealPlanLayout';

export function MealPlanLayoutToggle({
  value,
  disabled = false,
  onChange
}: {
  value: MealPlanLayout;
  disabled?: boolean;
  onChange: (layout: MealPlanLayout) => void;
}) {
  return (
    <div
      className="inline-flex rounded-xl bg-app-muted p-1 ring-1 ring-inset ring-app-border"
      role="group"
      aria-label="Meal layout"
      data-testid="meal-plan-layout"
    >
      {(['vertical', 'horizontal'] as const).map((layout) => (
        <button
          key={layout}
          type="button"
          aria-pressed={value === layout}
          disabled={disabled}
          className={clsx(
            'rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition disabled:opacity-50',
            value === layout ? 'bg-app-surface text-app-text shadow-sm' : 'text-app-text-muted hover:text-app-text'
          )}
          onClick={() => onChange(layout)}
        >
          {layout}
        </button>
      ))}
    </div>
  );
}
