import type { Meal } from '../types';
import type { DayMeals } from '../components/nutrition/weekly/weeklyHelpers';
import {
  dayActualKcal,
  dayKcalTargetStatus,
  dayPlannedKcal,
  findMeal,
  formatItemLine,
  kcalTargetHighlightClass,
  mealKcalTargetStatus,
  plannedItemsOf,
  statusLabel,
  buildGridRows
} from '../components/nutrition/weekly/weeklyHelpers';
import { escapeHtml, formatShortDayLabel } from './exportFormat';
import { printHtmlDocument } from './printDocument';
import { LANDSCAPE_PAGE_CSS } from './printStyles';

const REPORT_PRINT_STYLES = `
  ${LANDSCAPE_PAGE_CSS}
  :root {
    color: #111827;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px 20px;
    font-size: 10px;
    line-height: 1.35;
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
  .brand {
    margin: 0 0 4px;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #6b7280;
  }
  h1 {
    margin: 0 0 4px;
    font-size: 16px;
    letter-spacing: -0.02em;
  }
  .subtitle {
    margin: 0;
    font-size: 10px;
    color: #4b5563;
  }
  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 12px;
    font-size: 9px;
  }
  .summary-item {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 6px 10px;
    min-width: 100px;
  }
  .summary-label {
    margin: 0;
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #6b7280;
  }
  .summary-value {
    margin: 2px 0 0;
    font-size: 14px;
    font-weight: 700;
  }
  .week-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
    align-items: stretch;
  }
  .day-head-col {
    text-align: center;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 6px;
  }
  .meal-cell {
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 6px;
    min-height: 48px;
    break-inside: avoid;
  }
  .meal-cell.on-plan { border-color: #059669; background: #ecfdf5; }
  .meal-cell.over { border-color: #dc2626; background: #fef2f2; }
  .meal-name {
    margin: 0;
    font-size: 9px;
    font-weight: 700;
  }
  .meal-kcal {
    margin: 2px 0 0;
    font-size: 8px;
    color: #4b5563;
  }
  .meal-status {
    margin: 2px 0 0;
    font-size: 8px;
    color: #6b7280;
  }
  .item-line {
    margin: 2px 0 0;
    font-size: 8px;
    color: #374151;
  }
  .day-kcal {
    text-align: center;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 6px;
    font-size: 9px;
  }
  .legend {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid #e5e7eb;
    font-size: 8px;
    color: #6b7280;
  }
`;

function weekStats(days: DayMeals[]) {
  let plannedKcal = 0;
  let actualKcal = 0;
  let onPlan = 0;
  let plannedMeals = 0;

  for (const day of days) {
    for (const meal of day.meals) {
      plannedKcal += Number(meal.plannedCalories);
      actualKcal += Number(meal.actualCalories);
      if (Number(meal.plannedCalories) > 0 || plannedItemsOf(meal).length > 0) {
        plannedMeals += 1;
        if (meal.status === 'EATEN_AS_PLANNED') onPlan += 1;
      }
    }
  }

  return { plannedKcal: Math.round(plannedKcal), actualKcal: Math.round(actualKcal), onPlan, plannedMeals };
}

function mealCellClass(meal: Meal | undefined, date: string): string {
  if (!meal) return 'meal-cell';
  const planned = Math.round(Number(meal.plannedCalories));
  const actual = Math.round(Number(meal.actualCalories));
  const status = mealKcalTargetStatus(actual, planned, date, meal.status);
  if (status === 'at_or_under' && meal.status === 'EATEN_AS_PLANNED') return 'meal-cell on-plan';
  if (status === 'over') return 'meal-cell over';
  return 'meal-cell';
}

function buildMealCell(meal: Meal | undefined, mealName: string, date: string) {
  if (!meal) {
    return `<div class="meal-cell"><p class="meal-name">${escapeHtml(mealName)}</p><p class="meal-status">No plan</p></div>`;
  }

  const planned = Math.round(Number(meal.plannedCalories));
  const actual = Math.round(Number(meal.actualCalories));
  const items = plannedItemsOf(meal)
    .slice(0, 3)
    .map((item) => `<p class="item-line">${escapeHtml(formatItemLine(item))}</p>`)
    .join('');

  return `
    <div class="${mealCellClass(meal, date)}">
      <p class="meal-name">${escapeHtml(meal.name)}</p>
      <p class="meal-kcal">${actual}/${planned} kcal</p>
      <p class="meal-status">${escapeHtml(statusLabel(meal.status))}</p>
      ${items}
    </div>
  `;
}

export function buildCoachNutritionWeekReportHtml(
  days: DayMeals[],
  weekDates: string[],
  weekLabel: string,
  options?: { clientName?: string }
) {
  const stats = weekStats(days);
  const rows = buildGridRows(days);
  const clientLine = options?.clientName
    ? `<p class="subtitle">Client: ${escapeHtml(options.clientName)}</p>`
    : '';

  const dayHeaders = weekDates
    .map((date) => {
      const meals = days.find((day) => day.date === date)?.meals ?? [];
      const planned = Math.round(dayPlannedKcal(meals));
      const actual = Math.round(dayActualKcal(meals));
      return `
        <div class="day-head-col">
          <strong>${escapeHtml(formatShortDayLabel(date))}</strong>
          <div>${planned ? `${planned} kcal` : '—'}</div>
          <div>${actual ? `ate ${actual}` : '—'}</div>
        </div>
      `;
    })
    .join('');

  const mealRows = rows
    .map((row) => {
      const cells = weekDates
        .map((date) => {
          const meal = findMeal(days, date, row.mealNumber);
          return buildMealCell(meal, row.label, date);
        })
        .join('');
      return `<div class="week-grid">${cells}</div>`;
    })
    .join('');

  const dayKcalRow = weekDates
    .map((date) => {
      const meals = days.find((day) => day.date === date)?.meals ?? [];
      const planned = Math.round(dayPlannedKcal(meals));
      const actual = Math.round(dayActualKcal(meals));
      const status = dayKcalTargetStatus(actual, planned, date);
      const tone = kcalTargetHighlightClass(status).includes('green') ? 'on-plan' : status === 'over' ? 'over' : '';
      return `
        <div class="day-kcal ${tone}">
          <strong>${planned ? planned.toLocaleString() : '—'}</strong>
          <div>${actual ? `ate ${actual.toLocaleString()}` : '—'}</div>
        </div>
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="en" class="landscape-print">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1100, initial-scale=1" />
    <title>Food report · ${escapeHtml(weekLabel)}</title>
    <style>${REPORT_PRINT_STYLES}</style>
  </head>
  <body>
    <header>
      <p class="brand">Metabolic</p>
      <h1>Weekly food report</h1>
      <p class="subtitle">${escapeHtml(weekLabel)} · planned vs what they ate</p>
      ${clientLine}
    </header>
    <div class="summary">
      <div class="summary-item">
        <p class="summary-label">Week planned</p>
        <p class="summary-value">${stats.plannedKcal.toLocaleString()} kcal</p>
      </div>
      <div class="summary-item">
        <p class="summary-label">Week ate</p>
        <p class="summary-value">${stats.actualKcal ? stats.actualKcal.toLocaleString() : '—'} kcal</p>
      </div>
      <div class="summary-item">
        <p class="summary-label">On plan</p>
        <p class="summary-value">${stats.onPlan}/${stats.plannedMeals}</p>
      </div>
    </div>
    <div class="week-grid">${dayHeaders}</div>
    ${mealRows}
    <p style="margin:8px 0 4px;font-size:8px;color:#6b7280">Day kcal (planned, ate below)</p>
    <div class="week-grid">${dayKcalRow}</div>
    <p class="legend">Green = on plan within calories · red = over plan or missed past meals</p>
  </body>
</html>`;
}

export function printCoachNutritionWeekReport(
  days: DayMeals[],
  weekDates: string[],
  weekLabel: string,
  options?: { clientName?: string }
) {
  printHtmlDocument(
    buildCoachNutritionWeekReportHtml(days, weekDates, weekLabel, options),
    'Weekly food report print preview',
    { landscape: true }
  );
}
