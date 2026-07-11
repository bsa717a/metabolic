import type { MealPrepPlanResult } from '../types';
import { escapeHtml } from './exportFormat';
import { printHtmlDocument } from './printDocument';
import {
  formatContainerCount,
  formatFreshServingScope,
  formatPrepDate,
  formatPrepQuantity,
  pluralizePrepUnit
} from './mealPrepFormat';

function formatRangeLabel(result: MealPrepPlanResult) {
  if (result.startDate === result.endDate) return result.startDate;
  return `${result.startDate} to ${result.endDate}`;
}

function buildMealPrepHtml(result: MealPrepPlanResult) {
  const batchesHtml = result.batches
    .map((batch) => {
      const cookItemsHtml = batch.cookNow
        .map(
          (item) => `
            <li class="item">
              <span class="checkbox" aria-hidden="true"></span>
              <span class="item-title">${escapeHtml(
                `${formatPrepQuantity(item.totalQuantity)} ${pluralizePrepUnit(item.unit, item.totalQuantity)} ${item.name}`
              )}</span>
            </li>
          `
        )
        .join('');

      const freshItemsHtml = batch.addFresh
        .map(
          (item) => `
            <li class="item fresh">
              <span class="fresh-mark" aria-hidden="true">+</span>
              <span class="item-title">${escapeHtml(
                `${formatPrepQuantity(item.quantityPerServing)} ${pluralizePrepUnit(item.unit, item.quantityPerServing)} ${item.name} per serving${formatFreshServingScope(item, batch)}`
              )}</span>
            </li>
          `
        )
        .join('');

      const freshSection = batch.addFresh.length
        ? `<p class="list-label">Add fresh at serving</p><ul>${freshItemsHtml}</ul>`
        : '';
      const notes = [batch.reheat ? `Reheat: ${batch.reheat}` : null, batch.storageNote ? `Storage: ${batch.storageNote}` : null]
        .filter(Boolean)
        .map((line) => `<p class="batch-note">${escapeHtml(line as string)}</p>`)
        .join('');

      return `
        <section class="section">
          <h2>${escapeHtml(`${batch.label} × ${batch.occurrenceCount}`)}</h2>
          <p class="batch-meta">${escapeHtml(
            `${formatContainerCount(batch)} · ${batch.container} · label ${batch.dates.map(formatPrepDate).join(', ')}`
          )}</p>
          <p class="list-label">Cook now</p>
          <ul>${cookItemsHtml}</ul>
          ${freshSection}
          ${notes}
        </section>
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Meal prep plan</title>
    <style>
      :root {
        color: #111827;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 0.3in;
        font-size: 9px;
        line-height: 1.25;
      }
      header {
        border-bottom: 1px solid #1f2933;
        margin-bottom: 10px;
        padding-bottom: 6px;
      }
      h1 {
        margin: 0;
        font-size: 14px;
        letter-spacing: -0.01em;
      }
      .subtitle {
        margin: 2px 0 0;
        color: #4b5563;
        font-size: 9px;
      }
      .sections {
        column-count: 2;
        column-gap: 18px;
      }
      .section {
        break-inside: avoid;
        margin-bottom: 12px;
      }
      .section h2 {
        margin: 0 0 2px;
        font-size: 10px;
        letter-spacing: -0.01em;
      }
      .batch-meta {
        margin: 0 0 4px;
        color: #6b7280;
        font-size: 8px;
      }
      .list-label {
        margin: 4px 0 2px;
        font-size: 7px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #6b7280;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .item {
        display: grid;
        grid-template-columns: 10px minmax(0, 1fr);
        gap: 5px;
        align-items: start;
        padding: 1px 0;
        break-inside: avoid;
      }
      .checkbox {
        width: 9px;
        height: 9px;
        margin-top: 1px;
        border: 1px solid #374151;
        border-radius: 1px;
      }
      .fresh-mark {
        width: 9px;
        text-align: center;
        color: #6b7280;
        font-weight: 600;
      }
      .item-title {
        margin: 0;
        font-size: 9px;
        font-weight: 500;
      }
      .batch-note {
        margin: 3px 0 0;
        color: #4b5563;
        font-size: 8px;
      }
      .footnote {
        margin: 8px 0 0;
        color: #9ca3af;
        font-size: 7px;
        line-height: 1.3;
      }
      @media print {
        body { padding: 0.25in; }
        @page { margin: 0.35in; size: portrait; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Meal prep plan</h1>
      <p class="subtitle">${escapeHtml(formatRangeLabel(result))} · ${result.batchCount} batch${
        result.batchCount === 1 ? '' : 'es'
      } · ${result.containerCount} container${result.containerCount === 1 ? '' : 's'}</p>
    </header>
    <div class="sections">${batchesHtml}</div>
    <p class="footnote">${escapeHtml(result.note)}</p>
  </body>
</html>`;
}

export function printMealPrep(result: MealPrepPlanResult) {
  if (!result.batchCount) return;
  printHtmlDocument(buildMealPrepHtml(result), 'Meal prep print preview');
}
