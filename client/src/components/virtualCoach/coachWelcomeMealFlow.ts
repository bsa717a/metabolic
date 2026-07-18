import type { Meal } from '../../types';

export type CoachWelcomeQuickReply = {
  label: string;
  mobileLabel?: string;
  message: string;
  action?:
    | 'review-meals'
    | 'show-meal'
    | 'edit-meal'
    | 'skip-meal-edit'
    | 'done-meal-edit'
    | 'show-meal-again'
    | 'pick-another-meal'
    | 'rebalance-meal'
    | 'dismiss-rebalance';
  mealId?: string;
};

export type MealEditSession = {
  mealId: string;
  mealName: string;
  mealNumber: number;
  date: string;
  targetCalories?: number;
};

export function quickReplyDisplayLabel(reply: CoachWelcomeQuickReply) {
  const mobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
  return mobile && reply.mobileLabel ? reply.mobileLabel : reply.label;
}

/** Typed "review meals" / "review my meals" should enter the guided meal flow. */
export function isReviewMealsRequest(text: string) {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/g, '');
  return (
    normalized === 'review meals' ||
    normalized === 'review my meals' ||
    normalized === 'review meal' ||
    normalized === 'edit meals' ||
    normalized === 'edit my meals'
  );
}

export const MEAL_PICKER_PROMPT =
  'What meal would you like to review?';

export const MEAL_EDIT_OFFER = 'Would you like to edit this meal?';

export const MEAL_EDIT_ACTIVE_PROMPT =
  "We're editing this meal together. Tell me what to change — add, remove, or swap foods. I'll update the plan for this meal only. Tap Done when you're happy with it.";

export const CALORIE_BAND = 0.1;

export function isMealOutOfBalance(calories: number, targetCalories: number | undefined) {
  if (!targetCalories || targetCalories <= 0) return false;
  return Math.abs(calories - targetCalories) > targetCalories * CALORIE_BAND;
}

function formatMacros(calories: number, protein: number, carbs: number, fat: number) {
  return `${Math.round(calories)} cal · ${Math.round(protein)}g protein · ${Math.round(carbs)}g carbs · ${Math.round(fat)}g fat`;
}

function formatStatus(status: string) {
  return status.replace(/_/g, ' ').toLowerCase();
}

export function formatMealDetailForChat(meal: Meal, options?: { includeEditHint?: boolean }) {
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
  } else {
    lines.push('', 'No foods planned yet.');
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

  if (options?.includeEditHint !== false) {
    lines.push('', MEAL_EDIT_OFFER);
  }

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

export function mealReviewQuickReplies(meal: Meal): CoachWelcomeQuickReply[] {
  return [
    { label: 'Edit this meal', mobileLabel: 'Edit', message: 'Edit this meal', action: 'edit-meal', mealId: meal.id },
    { label: 'Looks good', mobileLabel: 'Good', message: 'Looks good', action: 'skip-meal-edit', mealId: meal.id },
    { label: 'Pick another meal', mobileLabel: 'Other', message: 'Pick another meal', action: 'pick-another-meal' }
  ];
}

export function mealEditModeQuickReplies(mealId: string): CoachWelcomeQuickReply[] {
  return [
    { label: 'Done with this meal', mobileLabel: 'Done', message: "I'm done with this meal", action: 'done-meal-edit', mealId },
    { label: 'Show current plan', mobileLabel: 'Show', message: 'Show current plan', action: 'show-meal-again', mealId },
    { label: 'Pick another meal', mobileLabel: 'Other', message: 'Pick another meal', action: 'pick-another-meal' }
  ];
}

export function mealRebalanceQuickReplies(mealId: string): CoachWelcomeQuickReply[] {
  return [
    { label: 'Yes, help me', mobileLabel: 'Yes', message: 'Help me get this meal back in balance', action: 'rebalance-meal', mealId },
    { label: 'Not now', mobileLabel: 'No', message: 'Not now', action: 'dismiss-rebalance', mealId },
    { label: 'Done with this meal', mobileLabel: 'Done', message: "I'm done with this meal", action: 'done-meal-edit', mealId }
  ];
}
