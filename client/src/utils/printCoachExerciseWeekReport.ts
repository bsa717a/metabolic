import type { ScheduledExercise } from '../types';
import type { DayExercises } from './planExportData';
import { escapeHtml, formatShortDayLabel } from './exportFormat';
import { formatExercisePlan } from './printExercisePlan';
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
  .day-col {
    border: 1px solid #d1d5db;
    border-radius: 10px;
    padding: 8px;
    min-width: 0;
    break-inside: avoid;
  }
  .day-head {
    margin: 0 0 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e5e7eb;
  }
  .day-title {
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .day-progress {
    margin: 2px 0 0;
    font-size: 8px;
    color: #6b7280;
  }
  .ex-line {
    display: flex;
    gap: 5px;
    align-items: flex-start;
    margin: 0 0 7px;
    font-size: 9px;
    line-height: 1.35;
  }
  .ex-line:last-child { margin-bottom: 0; }
  .mark {
    width: 11px;
    height: 11px;
    margin-top: 1px;
    border: 1px solid #374151;
    border-radius: 2px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: 700;
    line-height: 1;
  }
  .mark.done {
    border-color: #059669;
    background: #ecfdf5;
    color: #047857;
  }
  .mark.skipped {
    border-color: #9ca3af;
    background: #f3f4f6;
    color: #6b7280;
  }
  .ex-body { min-width: 0; flex: 1; }
  .ex-name {
    margin: 0;
    font-weight: 700;
    color: #111827;
  }
  .ex-plan {
    margin: 1px 0 0;
    color: #4b5563;
  }
  .ex-status {
    margin: 1px 0 0;
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #6b7280;
  }
  .ex-status.done { color: #047857; }
  .ex-status.skipped { color: #6b7280; }
  .day-empty {
    margin: 0;
    font-size: 9px;
    color: #9ca3af;
    font-style: italic;
  }
  .legend {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid #e5e7eb;
    font-size: 8px;
    color: #6b7280;
  }
`;

function statusMark(status: string) {
  if (status === 'DONE') return '<span class="mark done" aria-hidden="true">✓</span>';
  if (status === 'SKIPPED') return '<span class="mark skipped" aria-hidden="true">—</span>';
  return '<span class="mark" aria-hidden="true"></span>';
}

function statusPrintLabel(status: string) {
  switch (status) {
    case 'DONE':
      return 'Done';
    case 'SKIPPED':
      return 'Skipped';
    case 'PLANNED':
      return 'Planned';
    default:
      return status.replaceAll('_', ' ');
  }
}

function buildExerciseLine(item: ScheduledExercise) {
  const statusClass = item.status === 'DONE' ? 'done' : item.status === 'SKIPPED' ? 'skipped' : '';
  return `
    <div class="ex-line">
      ${statusMark(item.status)}
      <div class="ex-body">
        <p class="ex-name">${escapeHtml(item.exercise.name)}</p>
        <p class="ex-plan">${escapeHtml(formatExercisePlan(item))}</p>
        <p class="ex-status ${statusClass}">${escapeHtml(statusPrintLabel(item.status))}</p>
      </div>
    </div>
  `;
}

function buildReportDayColumn({ date, exercises }: DayExercises) {
  const done = exercises.filter((item) => item.status === 'DONE').length;
  const planned = exercises.length;
  const progress =
    planned === 0 ? 'Rest day' : `${done} of ${planned} done`;

  if (!exercises.length) {
    return `
      <div class="day-col">
        <div class="day-head">
          <p class="day-title">${escapeHtml(formatShortDayLabel(date))}</p>
          <p class="day-progress">${escapeHtml(progress)}</p>
        </div>
        <p class="day-empty">No exercises scheduled</p>
      </div>
    `;
  }

  return `
    <div class="day-col">
      <div class="day-head">
        <p class="day-title">${escapeHtml(formatShortDayLabel(date))}</p>
        <p class="day-progress">${escapeHtml(progress)}</p>
      </div>
      ${exercises.map(buildExerciseLine).join('')}
    </div>
  `;
}

function weekStats(days: DayExercises[]) {
  let planned = 0;
  let done = 0;
  let skipped = 0;
  for (const day of days) {
    for (const exercise of day.exercises) {
      planned += 1;
      if (exercise.status === 'DONE') done += 1;
      if (exercise.status === 'SKIPPED') skipped += 1;
    }
  }
  return { planned, done, skipped };
}

export function buildCoachExerciseWeekReportHtml(
  days: DayExercises[],
  weekLabel: string,
  options?: { clientName?: string }
) {
  const stats = weekStats(days);
  const clientLine = options?.clientName
    ? `<p class="subtitle">Client: ${escapeHtml(options.clientName)}</p>`
    : '';
  const columnsHtml = days.map(buildReportDayColumn).join('');

  return `<!doctype html>
<html lang="en" class="landscape-print">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1100, initial-scale=1" />
    <title>Exercise report · ${escapeHtml(weekLabel)}</title>
    <style>${REPORT_PRINT_STYLES}</style>
  </head>
  <body>
    <header>
      <p class="brand">Metabolic</p>
      <h1>Weekly exercise report</h1>
      <p class="subtitle">${escapeHtml(weekLabel)} · planned vs completed</p>
      ${clientLine}
    </header>
    <div class="summary">
      <div class="summary-item">
        <p class="summary-label">Scheduled</p>
        <p class="summary-value">${stats.planned}</p>
      </div>
      <div class="summary-item">
        <p class="summary-label">Completed</p>
        <p class="summary-value">${stats.done || '—'}</p>
      </div>
      <div class="summary-item">
        <p class="summary-label">Skipped</p>
        <p class="summary-value">${stats.skipped || '—'}</p>
      </div>
    </div>
    <div class="week-grid">${columnsHtml}</div>
    <p class="legend">✓ = completed · — = skipped · empty box = still planned · Rest day = no exercises scheduled</p>
  </body>
</html>`;
}

export function printCoachExerciseWeekReport(
  days: DayExercises[],
  weekLabel: string,
  options?: { clientName?: string }
) {
  printHtmlDocument(
    buildCoachExerciseWeekReportHtml(days, weekLabel, options),
    'Weekly exercise report print preview',
    { landscape: true }
  );
}
