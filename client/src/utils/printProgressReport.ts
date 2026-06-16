import type { BloodPanelMetricValue, BloodPanelStatus, ProgressSummary } from '../types';
import { escapeHtml, formatExportDate } from './exportFormat';
import { printHtmlDocument } from './printDocument';

const STATUS_COLORS: Record<BloodPanelStatus, { text: string; bg: string }> = {
  low: { text: '#854d0e', bg: '#fef9c3' },
  normal: { text: '#166534', bg: '#dcfce7' },
  high: { text: '#9a3412', bg: '#ffedd5' },
  unknown: { text: '#334155', bg: '#f1f5f9' }
};

function statusLabel(status: BloodPanelStatus | null) {
  if (!status) return '';
  if (status === 'normal') return 'Normal';
  if (status === 'low') return 'Low';
  if (status === 'high') return 'High';
  return 'Unknown';
}

function trendSymbol(trend: BloodPanelMetricValue['trend']) {
  if (trend === 'up') return '↑';
  if (trend === 'down') return '↓';
  if (trend === 'same') return '→';
  return '';
}

function formatMetricValue(value: number | null, unit: string) {
  if (value == null) return '—';
  return `${value} ${unit}`;
}

function renderBloodPanelMetrics(metrics: BloodPanelMetricValue[]) {
  const populated = metrics.filter((metric) => metric.value != null);
  if (!populated.length) {
    return '<p class="muted">No metric values recorded on this panel.</p>';
  }

  return `
    <div class="metric-grid">
      ${populated
        .map((metric) => {
          const colors = metric.status ? STATUS_COLORS[metric.status] : STATUS_COLORS.unknown;
          const trend = trendSymbol(metric.trend);
          return `
            <div class="metric-card" style="border-color:${colors.text};background:${colors.bg};">
              <p class="metric-label">${escapeHtml(metric.label)}</p>
              <p class="metric-value" style="color:${colors.text};">
                ${escapeHtml(formatMetricValue(metric.value, metric.unit))}
                ${trend ? `<span class="trend">${trend}</span>` : ''}
              </p>
              ${metric.status ? `<p class="metric-status">${escapeHtml(statusLabel(metric.status))}</p>` : ''}
              ${
                metric.referenceRange
                  ? `<p class="metric-range">Normal: ${escapeHtml(metric.referenceRange.normal)}</p>`
                  : ''
              }
            </div>
          `;
        })
        .join('')}
    </div>
  `;
}

function renderBloodPanels(summary: ProgressSummary) {
  if (!summary.bloodPanels.length) {
    return `
      <section class="section">
        <h2>Blood panels</h2>
        <p class="muted">No blood panels recorded yet.</p>
      </section>
    `;
  }

  const latest = summary.bloodPanels[0];
  const history = summary.bloodPanels.slice(1);

  return `
    <section class="section">
      <h2>Blood panels</h2>
      <p class="section-lead">Latest lab results with reference-range status (per mmv1 blood panel spec).</p>
      <div class="panel-card">
        <div class="panel-header">
          <div>
            <p class="panel-date">${escapeHtml(formatExportDate(latest.labDate))}</p>
            ${latest.labProvider ? `<p class="muted">${escapeHtml(latest.labProvider)}</p>` : ''}
          </div>
          ${
            latest.enteredBy
              ? `<p class="muted">Added by ${escapeHtml(latest.enteredBy.name)}</p>`
              : ''
          }
        </div>
        ${renderBloodPanelMetrics(latest.metrics)}
        ${latest.notes ? `<p class="notes"><strong>Notes:</strong> ${escapeHtml(latest.notes)}</p>` : ''}
      </div>
      ${
        history.length
          ? `
            <h3 class="subsection-title">Recent history</h3>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Lab date</th>
                  <th>Provider</th>
                  <th>Metrics recorded</th>
                </tr>
              </thead>
              <tbody>
                ${history
                  .map((panel) => {
                    const count = panel.metrics.filter((metric) => metric.value != null).length;
                    return `
                      <tr>
                        <td>${escapeHtml(formatExportDate(panel.labDate))}</td>
                        <td>${escapeHtml(panel.labProvider ?? '—')}</td>
                        <td>${count} of 8</td>
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          `
          : ''
      }
    </section>
  `;
}

export function buildProgressReportHtml(summary: ProgressSummary) {
  const generated = new Date(summary.generatedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const metricRows = summary.metrics
    .map(
      (metric) => `
        <tr>
          <td>${escapeHtml(metric.label)}</td>
          <td>${metric.startValue} ${escapeHtml(metric.unit)}</td>
          <td>${metric.currentValue} ${escapeHtml(metric.unit)}</td>
          <td>${metric.goalValue} ${escapeHtml(metric.unit)}</td>
        </tr>
      `
    )
    .join('');

  const snapshotRows = summary.metricSnapshots
    .map((snapshot) => {
      const values = snapshot.values
        .map((value) => `${escapeHtml(value.label)}: ${value.currentValue} ${escapeHtml(value.unit)}`)
        .join(' · ');
      return `
        <tr>
          <td>${escapeHtml(formatExportDate(snapshot.date))}</td>
          <td>${values || '—'}</td>
        </tr>
      `;
    })
    .join('');

  const weightRows = summary.weightTrend
    .slice(-12)
    .map(
      (point) => `
        <tr>
          <td>${escapeHtml(formatExportDate(point.date))}</td>
          <td>${point.weight} lbs</td>
        </tr>
      `
    )
    .join('');

  const bodyRows = summary.bodyCompositionTrend
    .slice(-8)
    .map((point) => {
      const parts = [
        point.weight != null ? `${point.weight} lbs` : null,
        point.bodyFat != null ? `${point.bodyFat}% body fat` : null,
        point.waist != null ? `${point.waist}" waist` : null
      ].filter(Boolean);
      return `
        <tr>
          <td>${escapeHtml(formatExportDate(point.date))}</td>
          <td>${parts.length ? parts.join(' · ') : '—'}</td>
        </tr>
      `;
    })
    .join('');

  const photoRows = summary.progressPhotos
    .map(
      (photoSet) => `
        <tr>
          <td>${escapeHtml(formatExportDate(photoSet.date))}</td>
          <td>${photoSet.photoCount} photo${photoSet.photoCount === 1 ? '' : 's'}</td>
        </tr>
      `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Progress report</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #0f172a;
      line-height: 1.5;
      margin: 0;
      padding: 0.75in;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1, h2, h3 { margin: 0; }
    h1 { font-size: 1.75rem; }
    h2 { font-size: 1.125rem; margin-bottom: 0.75rem; }
    h3.subsection-title { font-size: 0.95rem; margin: 1.25rem 0 0.5rem; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 1rem; margin-bottom: 1.5rem; }
    .brand { font-size: 0.7rem; letter-spacing: 0.18em; text-transform: uppercase; color: #64748b; }
    .meta { margin-top: 0.5rem; color: #475569; font-size: 0.875rem; }
    .section { margin-top: 1.75rem; break-inside: avoid; }
    .section-lead { color: #64748b; font-size: 0.875rem; margin: 0 0 1rem; }
    .muted { color: #64748b; font-size: 0.875rem; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .data-table th, .data-table td { border-bottom: 1px solid #e2e8f0; padding: 0.5rem 0.25rem; text-align: left; vertical-align: top; }
    .data-table th { color: #64748b; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; }
    .metric-card { border: 1px solid #cbd5e1; border-radius: 0.75rem; padding: 0.75rem; }
    .metric-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; margin: 0 0 0.35rem; }
    .metric-value { font-size: 1rem; font-weight: 700; margin: 0; }
    .metric-status { font-size: 0.75rem; font-weight: 600; margin: 0.25rem 0 0; }
    .metric-range { font-size: 0.7rem; color: #64748b; margin: 0.35rem 0 0; }
    .trend { margin-left: 0.25rem; }
    .panel-card { border: 1px solid #e2e8f0; border-radius: 1rem; padding: 1rem; }
    .panel-header { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
    .panel-date { font-weight: 700; margin: 0; }
    .notes { margin-top: 1rem; font-size: 0.875rem; }
    @media print {
      body { padding: 0.35in; }
      @page { margin: 0.35in; size: portrait; }
    }
  </style>
</head>
<body>
  <header class="header">
    <p class="brand">Metabolic</p>
    <h1>Progress report</h1>
    <p class="meta">${escapeHtml(summary.client.name)} · ${escapeHtml(summary.program.name)} · Generated ${escapeHtml(generated)}</p>
    <p class="meta">Program ${escapeHtml(summary.program.startDate)}${summary.program.targetEndDate ? ` to ${escapeHtml(summary.program.targetEndDate)}` : ''}</p>
  </header>

  <section class="section">
    <h2>Start · current · goal</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th>Metric</th>
          <th>Start</th>
          <th>Current</th>
          <th>Goal</th>
        </tr>
      </thead>
      <tbody>${metricRows}</tbody>
    </table>
  </section>

  ${
    snapshotRows
      ? `
        <section class="section">
          <h2>Session snapshots</h2>
          <table class="data-table">
            <thead><tr><th>Date</th><th>Values</th></tr></thead>
            <tbody>${snapshotRows}</tbody>
          </table>
        </section>
      `
      : ''
  }

  ${
    weightRows
      ? `
        <section class="section">
          <h2>Weight trend</h2>
          <table class="data-table">
            <thead><tr><th>Date</th><th>Weight</th></tr></thead>
            <tbody>${weightRows}</tbody>
          </table>
        </section>
      `
      : ''
  }

  ${
    bodyRows
      ? `
        <section class="section">
          <h2>Body composition log</h2>
          <table class="data-table">
            <thead><tr><th>Date</th><th>Measurements</th></tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </section>
      `
      : ''
  }

  ${
    photoRows
      ? `
        <section class="section">
          <h2>Progress photos</h2>
          <table class="data-table">
            <thead><tr><th>Date</th><th>Captured</th></tr></thead>
            <tbody>${photoRows}</tbody>
          </table>
        </section>
      `
      : ''
  }

  ${renderBloodPanels(summary)}
</body>
</html>`;
}

export function printProgressReport(summary: ProgressSummary) {
  printHtmlDocument(buildProgressReportHtml(summary), 'Progress report print preview');
}
