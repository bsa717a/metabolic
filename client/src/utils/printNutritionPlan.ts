import type { Meal, MealItem } from '../types';
import type { DayMeals } from './planExportData';
import {
  escapeHtml,
  formatExportDate,
  formatItemQuantityLine,
  formatMacroLine,
  formatPlannedTime,
  formatShortDayLabel
} from './exportFormat';
import { printHtmlDocument } from './printDocument';
import { LANDSCAPE_PAGE_CSS } from './printStyles';

const DAY_PRINT_STYLES = `
  :root {
    color: #111827;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    font-size: 10px;
    line-height: 1.3;
    background: #fff;
    color: #111827;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  header {
    border-bottom: 1px solid #1f2933;
    margin-bottom: 12px;
    padding-bottom: 8px;
  }
  h1 {
    margin: 0 0 4px;
    font-size: 16px;
    letter-spacing: -0.02em;
  }
  .brand {
    margin: 0 0 4px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #6b7280;
  }
  .subtitle {
    margin: 0;
    font-size: 10px;
    color: #4b5563;
  }
  .day-plan {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 14px;
  }
  .meal-block {
    min-width: 0;
    page-break-inside: auto;
  }
  .meal-name {
    margin: 0 0 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    color: #000;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .food-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .food-item {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    margin: 0 0 2px;
  }
  .checkbox {
    width: 10px;
    height: 10px;
    margin-top: 1px;
    border: 1px solid #374151;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .food-line {
    margin: 0;
    font-size: 9px;
    line-height: 1.35;
    color: #000;
  }
  .meal-total-compact {
    margin: 4px 0 0;
    font-size: 8px;
    font-weight: 600;
    color: #4b5563;
  }
  .day-total {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #d1d5db;
  }
  .day-total-label {
    margin: 0 0 2px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9ca3af;
  }
  .day-total-value {
    margin: 0;
    font-size: 10px;
    font-weight: 600;
  }
  .empty {
    border: 1px dashed #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    text-align: center;
    color: #6b7280;
  }
  @media print {
    body { padding: 0.3in; }
    @page { margin: 0.35in; size: portrait; }
  }
`;

function buildMealSection(meal: Meal) {
  const plannedItems = (meal.items ?? []).filter((item) => item.type === 'PLANNED');
  const plannedTime = formatPlannedTime(meal.plannedTime);
  const heading = plannedTime ? `${meal.name} · ${plannedTime}` : meal.name;

  const itemsHtml = plannedItems.length
    ? plannedItems
        .map(
          (item: MealItem) => `
            <li class="food-item">
              <span class="checkbox" aria-hidden="true"></span>
              <p class="food-line">${escapeHtml(formatItemQuantityLine(item.quantity, item.unit, item.nameSnapshot))}</p>
            </li>
          `
        )
        .join('')
    : `<li class="food-item"><p class="food-line">No foods planned</p></li>`;

  return `
    <section class="meal-block">
      <p class="meal-name">${escapeHtml(heading)}</p>
      <ul class="food-list">${itemsHtml}</ul>
      <p class="meal-total-compact">${escapeHtml(formatMacroLine(meal.plannedCalories, meal.plannedProtein, meal.plannedCarbs, meal.plannedFat))}</p>
    </section>
  `;
}

export function buildNutritionPlanHtml(meals: Meal[], date: string) {
  const dayTotals = meals.reduce(
    (sum, meal) => ({
      calories: sum.calories + Number(meal.plannedCalories),
      protein: sum.protein + Number(meal.plannedProtein),
      carbs: sum.carbs + Number(meal.plannedCarbs),
      fat: sum.fat + Number(meal.plannedFat)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const sectionsHtml = meals.map(buildMealSection).join('');
  const dayTotalHtml = meals.length
    ? `
      <section class="day-total">
        <p class="day-total-label">Day total</p>
        <p class="day-total-value">${escapeHtml(formatMacroLine(dayTotals.calories, dayTotals.protein, dayTotals.carbs, dayTotals.fat))}</p>
      </section>
    `
    : `<p class="empty">No meals planned for this day.</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Nutrition plan · ${escapeHtml(date)}</title>
    <style>${DAY_PRINT_STYLES}</style>
  </head>
  <body>
    <header>
      <p class="brand">Metabolic</p>
      <h1>Nutrition plan</h1>
      <p class="subtitle">${escapeHtml(formatExportDate(date))}</p>
    </header>
    <div class="day-plan">${sectionsHtml}</div>
    ${dayTotalHtml}
  </body>
</html>`;
}

export function printNutritionPlan(meals: Meal[], date: string) {
  if (!meals.length) return;
  printHtmlDocument(buildNutritionPlanHtml(meals, date), 'Nutrition plan print preview');
}

const WEEK_PRINT_STYLES = `
  ${LANDSCAPE_PAGE_CSS}
  ${DAY_PRINT_STYLES.replace(
    '@media print {\n    body { padding: 0.3in; }\n    @page { margin: 0.35in; size: portrait; }\n  }',
    ''
  )}
  body { padding: 20px; font-size: 10px; }
  .week-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
    align-items: stretch;
  }
  .day-col {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 8px;
    min-width: 0;
    break-inside: avoid;
  }
  .day-head {
    margin: 0 0 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #d1d5db;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .meal-block { margin-bottom: 8px; }
  .meal-block:last-child { margin-bottom: 0; }
  .meal-name {
    margin: 0 0 3px;
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    color: #000;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .food-line {
    margin: 0 0 2px;
    font-size: 9px;
    line-height: 1.35;
    color: #000;
  }
  .day-total-compact {
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid #e5e7eb;
    font-size: 8px;
    font-weight: 600;
    color: #4b5563;
  }
  .day-empty {
    margin: 0;
    font-size: 9px;
    color: #9ca3af;
    font-style: italic;
  }
`;

function buildWeekDayColumn({ date, meals }: DayMeals) {
  if (!meals.length) {
    return `
      <div class="day-col">
        <p class="day-head">${escapeHtml(formatShortDayLabel(date))}</p>
        <p class="day-empty">No meals planned</p>
      </div>
    `;
  }

  const mealsHtml = meals
    .map((meal) => {
      const plannedItems = (meal.items ?? []).filter((item) => item.type === 'PLANNED');
      const plannedTime = formatPlannedTime(meal.plannedTime);
      const title = plannedTime ? `${meal.name} · ${plannedTime}` : meal.name;
      const foodsHtml = plannedItems.length
        ? plannedItems
            .map(
              (item: MealItem) =>
                `<p class="food-line">${escapeHtml(formatItemQuantityLine(item.quantity, item.unit, item.nameSnapshot))}</p>`
            )
            .join('')
        : `<p class="food-line day-empty">No foods planned</p>`;

      return `
        <div class="meal-block">
          <p class="meal-name">${escapeHtml(title)}</p>
          ${foodsHtml}
        </div>
      `;
    })
    .join('');

  const dayTotals = meals.reduce(
    (sum, meal) => ({
      calories: sum.calories + Number(meal.plannedCalories),
      protein: sum.protein + Number(meal.plannedProtein)
    }),
    { calories: 0, protein: 0 }
  );

  return `
    <div class="day-col">
      <p class="day-head">${escapeHtml(formatShortDayLabel(date))}</p>
      ${mealsHtml}
      <p class="day-total-compact">${Math.round(dayTotals.calories)} kcal · ${Math.round(dayTotals.protein)}g protein</p>
    </div>
  `;
}

export function buildNutritionWeekPlanHtml(days: DayMeals[], weekLabel: string) {
  const columnsHtml = days.map(buildWeekDayColumn).join('');

  return `<!doctype html>
<html lang="en" class="landscape-print">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1100, initial-scale=1" />
    <title>Nutrition plan · ${escapeHtml(weekLabel)}</title>
    <style>${WEEK_PRINT_STYLES}</style>
  </head>
  <body>
    <header>
      <p class="brand">Metabolic</p>
      <h1>Weekly nutrition plan</h1>
      <p class="subtitle">${escapeHtml(weekLabel)}</p>
    </header>
    <div class="week-grid">${columnsHtml}</div>
  </body>
</html>`;
}

export function printNutritionWeekPlan(days: DayMeals[], weekLabel: string) {
  if (!days.some((day) => day.meals.length > 0)) return;
  printHtmlDocument(buildNutritionWeekPlanHtml(days, weekLabel), 'Weekly nutrition plan print preview', {
    landscape: true
  });
}

const HORIZONTAL_WEEK_STYLES = `
  ${LANDSCAPE_PAGE_CSS}
  :root { color: #111; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 12px;
    background: #fff;
    color: #111;
    font-size: 9px;
    line-height: 1.3;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 { margin: 0 0 4px; font-size: 16px; letter-spacing: -0.02em; }
  .meta { margin: 0; font-size: 10px; }
  .meta + .meta { margin-top: 2px; }
  table.tracker { width: 100%; margin-top: 8px; border-collapse: collapse; table-layout: fixed; }
  .tracker th, .tracker td { border: 1px solid #111; padding: 3px 2px; text-align: center; vertical-align: middle; }
  .tracker th { font-size: 8px; font-weight: 700; }
  .tracker td.day { text-align: left; font-weight: 700; padding-left: 4px; }
  .check {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1px solid #111;
    vertical-align: middle;
  }
  .write { height: 18px; }
  .meals {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-top: 10px;
  }
  .meal-col h2 {
    margin: 0 0 4px;
    padding-bottom: 2px;
    border-bottom: 1px solid #111;
    font-size: 10px;
    text-transform: uppercase;
  }
  .food { margin: 0 0 2px; font-size: 8px; }
  .empty-food { margin: 0; color: #4b5563; font-size: 8px; }
  .reminders { margin-top: 10px; padding-top: 6px; border-top: 1px solid #111; }
  .reminders h2 { margin: 0 0 4px; font-size: 11px; }
  .reminders p { margin: 0 0 3px; font-size: 8px; white-space: pre-wrap; }
  @media print {
    body { padding: 0.3in; }
    @page { margin: 0.35in; size: letter landscape; }
  }
`;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type NutritionHorizontalWeekInput = {
  days: DayMeals[];
  weekStart: string;
  selectedDate?: string;
  clientName?: string | null;
  weekNumber?: number | null;
  waterGoalOz?: number | null;
  reminders?: string | null;
  sourcePlanDate?: string | null;
};

function weekdayLabel(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const index = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).getUTCDay();
  return WEEKDAYS[index] ?? date;
}

function formatLongDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function planTitle(weekNumber: number | null | undefined, clientName: string | null | undefined) {
  const name = clientName?.trim();
  const who = name ? `${name}'s ` : '';
  const week = weekNumber != null ? `Week ${weekNumber} ` : '';
  return `${week}${who}Master Metabolic Plan`.replace(/\s+/g, ' ').trim();
}

function foodBulletPortion(item: MealItem) {
  const quantity = Number(item.quantity);
  const unit = item.unit?.trim();
  const portion = unit ? `${quantity} ${unit}` : `${quantity}`;
  return `${item.nameSnapshot} • ${portion}`;
}

function mealsForColumns(days: DayMeals[], selectedDate?: string) {
  const preferred = selectedDate
    ? days.find((day) => day.date === selectedDate && day.meals.length)
    : undefined;
  const source = preferred ?? days.find((day) => day.meals.length);
  const meals = [...(source?.meals ?? [])].sort((a, b) => a.mealNumber - b.mealNumber);
  const byNumber = new Map<number, Meal>();
  for (const meal of meals) {
    if (meal.mealNumber >= 1 && meal.mealNumber <= 4 && !byNumber.has(meal.mealNumber)) {
      byNumber.set(meal.mealNumber, meal);
    }
  }
  if (!byNumber.size) {
    meals.slice(0, 4).forEach((meal, index) => byNumber.set(index + 1, meal));
  }
  return [1, 2, 3, 4].map((number) => byNumber.get(number) ?? null);
}

function mealColumnHtml(number: number, meal: Meal | null) {
  const planned = (meal?.items ?? []).filter((item) => item.type === 'PLANNED');
  const foods = planned.length
    ? planned.map((item) => `<p class="food">${escapeHtml(foodBulletPortion(item))}</p>`).join('')
    : `<p class="empty-food">No foods planned</p>`;
  return `<section class="meal-col"><h2>Meal ${number}</h2>${foods}</section>`;
}

export function buildNutritionHorizontalWeekHtml(input: NutritionHorizontalWeekInput) {
  const water =
    input.waterGoalOz != null && Number.isFinite(input.waterGoalOz)
      ? `${Math.round(input.waterGoalOz)} oz`
      : '—';
  const trackerRows = input.days
    .map(
      (day) => `<tr>
        <td class="day">${escapeHtml(weekdayLabel(day.date))}</td>
        <td><span class="check"></span></td>
        <td><span class="check"></span></td>
        <td><span class="check"></span></td>
        <td><span class="check"></span></td>
        <td class="write"></td>
        <td class="write"></td>
        <td class="write"></td>
      </tr>`
    )
    .join('');
  const columns = mealsForColumns(input.days, input.selectedDate)
    .map((meal, index) => mealColumnHtml(index + 1, meal))
    .join('');
  const source = input.sourcePlanDate ? formatExportDate(input.sourcePlanDate) : 'not set';
  const reminderBody = input.reminders?.trim()
    ? `<p>${escapeHtml(input.reminders.trim())}</p>`
    : '';

  return `<!doctype html>
<html lang="en" class="landscape-print">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(planTitle(input.weekNumber, input.clientName))}</title>
    <style>${HORIZONTAL_WEEK_STYLES}</style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(planTitle(input.weekNumber, input.clientName))}</h1>
      <p class="meta">Daily water goal: ${escapeHtml(water)}</p>
      <p class="meta">Week of ${escapeHtml(formatLongDate(input.weekStart))}</p>
    </header>
    <table class="tracker">
      <thead>
        <tr>
          <th>Day</th>
          <th>Meal 1</th>
          <th>Meal 2</th>
          <th>Meal 3</th>
          <th>Meal 4</th>
          <th>Water oz</th>
          <th>Sleep</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>${trackerRows}</tbody>
    </table>
    <div class="meals">${columns}</div>
    <section class="reminders">
      <h2>Substitutions and reminders from the program</h2>
      <p>Source plan date: ${escapeHtml(source)}</p>
      ${reminderBody}
    </section>
  </body>
</html>`;
}

export function printNutritionHorizontalWeek(input: NutritionHorizontalWeekInput) {
  if (!input.days.some((day) => day.meals.length > 0)) return;
  printHtmlDocument(buildNutritionHorizontalWeekHtml(input), 'Weekly nutrition plan print preview', {
    landscape: true
  });
}
