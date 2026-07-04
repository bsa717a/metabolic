import type { Meal, MealItem } from '../../types';
import { Drawer } from '../ui/Drawer';

function formatItemMacros(item: Pick<MealItem, 'calories' | 'protein' | 'carbs' | 'fat'>) {
  return `${Math.round(Number(item.calories))} kcal · ${Math.round(Number(item.protein))}g P · ${Math.round(Number(item.carbs))}g C · ${Math.round(Number(item.fat))}g F`;
}

function formatTotals(label: string, calories: number, protein: number, carbs: number, fat: number) {
  return `${label}: ${Math.round(calories)} kcal · ${Math.round(protein)}g protein · ${Math.round(carbs)}g carbs · ${Math.round(fat)}g fat`;
}

function ItemList({ title, items }: { title: string; items: MealItem[] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-app-text">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-app-text-muted">No items logged.</p>
      ) : (
        <ul className="mt-2 divide-y divide-app-muted rounded-2xl border border-app-border">
          {items.map((item) => (
            <li key={item.id} className="px-3 py-2.5">
              <p className="text-sm font-medium text-app-text">
                {item.nameSnapshot}
                <span className="ml-1 font-normal text-app-text-muted">
                  ({Number(item.quantity)} {item.unit})
                </span>
              </p>
              <p className="mt-0.5 text-xs text-app-text-muted">{formatItemMacros(item)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MealMacroDetailsDrawer({
  open,
  meal,
  onClose
}: {
  open: boolean;
  meal?: Meal;
  onClose: () => void;
}) {
  const plannedItems = meal?.items.filter((item) => item.type === 'PLANNED') ?? [];
  const actualItems = meal?.items.filter((item) => item.type === 'ACTUAL') ?? [];

  return (
    <Drawer open={open} title={meal ? `${meal.name} — macro details` : 'Macro details'} onClose={onClose}>
      {meal && (
        <div className="space-y-5">
          <div className="grid gap-3">
            <div className="rounded-2xl bg-brand-gold/10 p-3 text-sm text-app-text ring-1 ring-brand-gold/20">
              {formatTotals(
                'Planned',
                Number(meal.plannedCalories),
                Number(meal.plannedProtein),
                Number(meal.plannedCarbs),
                Number(meal.plannedFat)
              )}
            </div>
            <div className="rounded-2xl bg-brand-green/10 p-3 text-sm text-app-text ring-1 ring-brand-green/20">
              {formatTotals(
                'Actual',
                Number(meal.actualCalories),
                Number(meal.actualProtein),
                Number(meal.actualCarbs),
                Number(meal.actualFat)
              )}
            </div>
          </div>

          <ItemList title="Planned foods" items={plannedItems} />
          <ItemList title="Logged foods" items={actualItems} />
        </div>
      )}
    </Drawer>
  );
}
