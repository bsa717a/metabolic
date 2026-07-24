import type { ScheduledExercise } from '../types';
import type { DayExercises } from './planExportData';
import { formatPlan } from './exerciseFormat';
import { escapeHtml, formatExportDate, formatShortDayLabel } from './exportFormat';
import { printHtmlDocument } from './printDocument';
import { LANDSCAPE_PAGE_CSS } from './printStyles';

/** @deprecated Use `formatPlan` from `utils/exerciseFormat`. Kept as an alias for existing importers. */
export const formatExercisePlan = (item: ScheduledExercise) => formatPlan(item);

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
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .item {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    margin: 0 0 4px;
    page-break-inside: auto;
  }
  .checkbox {
    width: 10px;
    height: 10px;
    margin-top: 1px;
    border: 1px solid #374151;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .item-body { min-width: 0; flex: 1; }
  .item-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: flex-start;
  }
  .item-title {
    margin: 0;
    font-size: 9px;
    font-weight: 600;
    line-height: 1.35;
  }
  .item-part {
    margin: 1px 0 0;
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #9ca3af;
  }
  .item-plan {
    margin: 0;
    flex-shrink: 0;
    font-size: 9px;
    color: #4b5563;
  }
  .item-notes {
    margin: 2px 0 0;
    font-size: 8px;
    color: #6b7280;
    line-height: 1.3;
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

export function buildExercisePlanHtml(exercises: ScheduledExercise[], date: string) {
  const itemsHtml = exercises.length
    ? exercises
        .map((item) => {
          const bodyPart = item.exercise.bodyPart
            ? `<p class="item-part">${escapeHtml(item.exercise.bodyPart)}</p>`
            : '';
          const notes = item.exercise.description
            ? `<p class="item-notes">${escapeHtml(item.exercise.description)}</p>`
            : '';

          return `
            <li class="item">
              <span class="checkbox" aria-hidden="true"></span>
              <div class="item-body">
                <div class="item-row">
                  <div>
                    <p class="item-title">${escapeHtml(item.exercise.name)}</p>
                    ${bodyPart}
                  </div>
                  <p class="item-plan">${escapeHtml(formatExercisePlan(item))}</p>
                </div>
                ${notes}
              </div>
            </li>
          `;
        })
        .join('')
    : '';

  const bodyContent = exercises.length
    ? `<ul>${itemsHtml}</ul>`
    : `<p class="empty">No exercises planned for this day.</p>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Exercise plan · ${escapeHtml(date)}</title>
    <style>${DAY_PRINT_STYLES}</style>
  </head>
  <body>
    <header>
      <p class="brand">Metabolic</p>
      <h1>Exercise plan</h1>
      <p class="subtitle">${escapeHtml(formatExportDate(date))}</p>
    </header>
    ${bodyContent}
  </body>
</html>`;
}

export function printExercisePlan(exercises: ScheduledExercise[], date: string) {
  if (!exercises.length) return;
  printHtmlDocument(buildExercisePlanHtml(exercises, date), 'Exercise plan print preview');
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
  .ex-line {
    margin: 0 0 8px;
    font-size: 9px;
    line-height: 1.35;
  }
  .ex-line:last-child { margin-bottom: 0; }
  .ex-name {
    margin: 0 0 2px;
    font-weight: 700;
    color: #111827;
  }
  .ex-plan {
    margin: 0;
    color: #4b5563;
  }
  .day-empty {
    margin: 0;
    font-size: 9px;
    color: #9ca3af;
    font-style: italic;
  }
`;

function buildWeekDayColumn({ date, exercises }: DayExercises) {
  if (!exercises.length) {
    return `
      <div class="day-col">
        <p class="day-head">${escapeHtml(formatShortDayLabel(date))}</p>
        <p class="day-empty">No exercises planned</p>
      </div>
    `;
  }

  const itemsHtml = exercises
    .map(
      (item) => `
        <div class="ex-line">
          <p class="ex-name">${escapeHtml(item.exercise.name)}</p>
          <p class="ex-plan">${escapeHtml(formatExercisePlan(item))}</p>
        </div>
      `
    )
    .join('');

  return `
    <div class="day-col">
      <p class="day-head">${escapeHtml(formatShortDayLabel(date))}</p>
      ${itemsHtml}
    </div>
  `;
}

export function buildExerciseWeekPlanHtml(days: DayExercises[], weekLabel: string) {
  const columnsHtml = days.map(buildWeekDayColumn).join('');

  return `<!doctype html>
<html lang="en" class="landscape-print">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1100, initial-scale=1" />
    <title>Exercise plan · ${escapeHtml(weekLabel)}</title>
    <style>${WEEK_PRINT_STYLES}</style>
  </head>
  <body>
    <header>
      <p class="brand">Metabolic</p>
      <h1>Weekly exercise plan</h1>
      <p class="subtitle">${escapeHtml(weekLabel)}</p>
    </header>
    <div class="week-grid">${columnsHtml}</div>
  </body>
</html>`;
}

export function printExerciseWeekPlan(days: DayExercises[], weekLabel: string) {
  if (!days.some((day) => day.exercises.length > 0)) return;
  printHtmlDocument(buildExerciseWeekPlanHtml(days, weekLabel), 'Weekly exercise plan print preview', {
    landscape: true
  });
}
