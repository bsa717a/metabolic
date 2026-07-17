import type { Meal } from '../../types';

export type CoachWelcomeQuickReply = {
  label: string;
  message: string;
  action?: 'review-meals' | 'show-meal';
  mealId?: string;
};

export const MEAL_PICKER_PROMPT =
  'What meal would you like to review?\n\nAnytime on the Nutrition page, tap the pencil on a meal to edit foods, adjust portions, or log what you ate.';

export const MEAL_EDIT_HINT =
  'Remember: on the Nutrition page, tap the pencil on this meal anytime to edit it.';

function formatMacros(calories: number, protein: number, carbs: number, fat: number) {
  return `${Math.round(calories)} cal · ${Math.round(protein)}g protein · ${Math.round(carbs)}g carbs · ${Math.round(fat)}g fat`;
}

function formatStatus(status: string) {
  return status.replace(/_/g, ' ').toLowerCase();
}

export function formatMealDetailForChat(meal: Meal) {
  const plannedItems = meal.items.filter((item) => item.type === 'PLANNED');
  const actualItems = meal.items.filter((item) => item.type === 'ACTUAL');
  const lines = [
    `${meal.name} — planned: ${formatMacros(
      meal.plannedCalories,
      meal.plannedProtein,
      meal.plannedCarbs,
      meal.plannedFat
    )}`
  ];

  if (meal.plannedTime) {
    lines.push(`Scheduled: ${meal.plannedTime}`);
  }

  lines.push(`Status: ${formatStatus(meal.status)}`);

  if (plannedItems.length) {
    lines.push('', 'Planned items:');
    for (const item of plannedItems) {
      lines.push(
        `• ${item.nameSnapshot} (${item.quantity} ${item.unit}) — ${Math.round(item.calories)} cal, ${Math.round(item.protein)}g protein`
      );
    }
  }

  if (actualItems.length || meal.actualCalories > 0) {
    lines.push(
      '',
      `Logged so far: ${formatMacros(meal.actualCalories, meal.actualProtein, meal.actualCarbs, meal.actualFat)}`
    );
    if (actualItems.length) {
      for (const item of actualItems) {
        lines.push(
          `• ${item.nameSnapshot} (${item.quantity} ${item.unit}) — ${Math.round(item.calories)} cal, ${Math.round(item.protein)}g protein`
        );
      }
    }
  }

  lines.push('', MEAL_EDIT_HINT);
  return lines.join('\n');
}

function mealPickerLabel(meal: Meal, meals: Meal[]) {
  const sameName = meals.filter((entry) => entry.name === meal.name);
  if (sameName.length <= 1) return meal.name;
  if (meal.plannedTime) return `${meal.name} · ${meal.plannedTime}`;
  return `${meal.name} (${meal.mealNumber})`;
}

export function mealPickerQuickReplies(meals: Meal[]): CoachWelcomeQuickReply[] {
  return meals.map((meal) => ({
    label: mealPickerLabel(meal, meals),
    message: meal.name,
    mealId: meal.id,
    action: 'show-meal'
  }));
}
