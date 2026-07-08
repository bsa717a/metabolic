import type { Meal } from '../types';
import { formatExportDate, formatItemQuantityLine, formatMacroLine, formatPlannedTime } from './exportFormat';

export function formatNutritionDayPlanForShare(meals: Meal[], date: string) {
  const lines = ['Nutrition plan', formatExportDate(date), ''];

  for (const meal of meals) {
    const plannedTime = formatPlannedTime(meal.plannedTime);
    const heading = plannedTime ? `${meal.name} · ${plannedTime}` : meal.name;
    lines.push(heading);

    const plannedItems = (meal.items ?? []).filter((item) => item.type === 'PLANNED');
    if (plannedItems.length) {
      for (const item of plannedItems) {
        lines.push(`• ${formatItemQuantityLine(item.quantity, item.unit, item.nameSnapshot)}`);
      }
    } else {
      lines.push('• No foods planned');
    }

    lines.push(formatMacroLine(meal.plannedCalories, meal.plannedProtein, meal.plannedCarbs, meal.plannedFat));
    lines.push('');
  }

  if (meals.length) {
    const dayTotals = meals.reduce(
      (sum, meal) => ({
        calories: sum.calories + Number(meal.plannedCalories),
        protein: sum.protein + Number(meal.plannedProtein),
        carbs: sum.carbs + Number(meal.plannedCarbs),
        fat: sum.fat + Number(meal.plannedFat)
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    lines.push(
      `Day total: ${formatMacroLine(dayTotals.calories, dayTotals.protein, dayTotals.carbs, dayTotals.fat)}`
    );
  }

  return lines.join('\n').trim();
}

export async function shareNutritionDayPlan(meals: Meal[], date: string) {
  const text = formatNutritionDayPlanForShare(meals, date);
  const title = `Nutrition plan · ${formatExportDate(date)}`;

  if (typeof navigator.share === 'function') {
    await navigator.share({ title, text });
    return;
  }

  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
    window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
    return;
  }

  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
}
