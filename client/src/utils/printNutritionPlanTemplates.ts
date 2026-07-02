import type { NutritionPlanTemplate } from '../types';
import {
  escapeHtml,
  formatItemMacros,
  formatItemQuantityLine,
  formatMacroLine,
  formatPlannedTime
} from './exportFormat';
import { formatPlanCriteriaDetailed } from './planCriteria';
import { printHtmlDocument } from './printDocument';

const PRINT_STYLES = `
  :root {
    color: #111827;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 20px;
    font-size: 10px;
    line-height: 1.4;
    background: #fff;
    color: #111827;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .doc-header {
    border-bottom: 2px solid #111827;
    margin-bottom: 20px;
    padding-bottom: 10px;
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
    font-size: 20px;
    letter-spacing: -0.02em;
  }
  .doc-subtitle {
    margin: 0;
    font-size: 11px;
    color: #4b5563;
  }
  .plan-card {
    border: 1px solid #d1d5db;
    border-radius: 8px;
    margin: 0 0 18px;
    padding: 14px 16px;
    page-break-inside: avoid;
  }
  .plan-card + .plan-card {
    page-break-before: auto;
  }
  .plan-title {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 700;
  }
  .plan-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin: 0 0 10px;
    font-size: 10px;
    color: #374151;
  }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .badge-global { background: #dbeafe; color: #1d4ed8; }
  .badge-user { background: #f1f5f9; color: #475569; }
  .badge-incomplete { background: #fef3c7; color: #92400e; }
  .criteria-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 10px;
    font-size: 10px;
  }
  .criteria-table th,
  .criteria-table td {
    border: 1px solid #e5e7eb;
    padding: 5px 8px;
    text-align: left;
    vertical-align: top;
  }
  .criteria-table th {
    width: 28%;
    background: #f9fafb;
    font-weight: 600;
    color: #374151;
  }
  .description {
    margin: 0 0 12px;
    white-space: pre-wrap;
    font-size: 10px;
    color: #374151;
  }
  .meals-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 14px;
  }
  .meal-block {
    min-width: 0;
    page-break-inside: avoid;
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
    margin: 0 0 3px;
    font-size: 9.5px;
    color: #111827;
  }
  .food-macros {
    color: #6b7280;
  }
  .empty-meal {
    font-size: 9.5px;
    color: #9ca3af;
    font-style: italic;
  }
  @media print {
    body { padding: 12px; }
    .plan-card { break-inside: avoid-page; }
  }
`;

function renderCriteriaTable(template: NutritionPlanTemplate) {
  const rows = formatPlanCriteriaDetailed(template);
  return `
    <table class="criteria-table">
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            <th scope="row">${escapeHtml(row.label)}</th>
            <td>${escapeHtml(row.value)}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

function renderMeals(template: NutritionPlanTemplate) {
  if (!template.meals.length) {
    return '<p class="empty-meal">No meals planned.</p>';
  }

  return `
    <div class="meals-grid">
      ${template.meals
        .map((meal) => {
          const time = formatPlannedTime(meal.plannedTime);
          const title = time ? `${meal.name} · ${time}` : meal.name;
          const items = meal.items.length
            ? meal.items
                .map(
                  (item) => `
              <li class="food-item">
                ${escapeHtml(formatItemQuantityLine(item.quantity, item.unit, item.nameSnapshot))}
                <span class="food-macros"> · ${escapeHtml(
                  formatItemMacros(item.calories, item.protein, item.carbs, item.fat)
                )}</span>
              </li>`
                )
                .join('')
            : '<li class="empty-meal">No foods planned</li>';

          return `
          <section class="meal-block">
            <h3 class="meal-name">${escapeHtml(title)}</h3>
            <ul class="food-list">${items}</ul>
          </section>`;
        })
        .join('')}
    </div>`;
}

function renderPlanCard(template: NutritionPlanTemplate) {
  const visibilityClass = template.visibility === 'GLOBAL' ? 'badge-global' : 'badge-user';
  const incompleteBadge = template.criteriaComplete
    ? ''
    : '<span class="badge badge-incomplete">Criteria incomplete</span>';

  return `
    <article class="plan-card">
      <h2 class="plan-title">${escapeHtml(template.name)}</h2>
      <div class="plan-meta">
        <span class="badge ${visibilityClass}">${escapeHtml(template.visibility)}</span>
        ${incompleteBadge}
        <span>${escapeHtml(formatMacroLine(template.calorieTarget, template.proteinTarget, template.carbTarget, template.fatTarget))}</span>
        <span>${template.meals.length} meals · ${template.itemCount} food items</span>
      </div>
      ${renderCriteriaTable(template)}
      ${template.description ? `<div class="description">${escapeHtml(template.description)}</div>` : ''}
      ${renderMeals(template)}
    </article>`;
}

export function buildNutritionPlanTemplatesPrintHtml(templates: NutritionPlanTemplate[], exportedAt = new Date()) {
  const dateLabel = exportedAt.toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Nutrition plans catalog</title>
    <style>${PRINT_STYLES}</style>
  </head>
  <body>
    <header class="doc-header">
      <p class="brand">Metabolic</p>
      <h1>Nutrition Plans Catalog</h1>
      <p class="doc-subtitle">${templates.length} plans · exported ${escapeHtml(dateLabel)}</p>
    </header>
    ${templates.map(renderPlanCard).join('')}
  </body>
</html>`;
}

export function printNutritionPlanTemplates(templates: NutritionPlanTemplate[]) {
  const html = buildNutritionPlanTemplatesPrintHtml(templates);
  printHtmlDocument(html, 'Nutrition plans catalog');
}
