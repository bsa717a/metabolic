import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import type { ProgressSummary } from '../../types';
import { PrintExportLayout } from '../../components/export/PrintExportLayout';
import { formatExportDate } from '../../utils/exportFormat';
import { printProgressReport } from '../../utils/printProgressReport';
import { BloodPanelMetricCard } from '../../components/program/bloodPanelDisplay';

export function ProgressExportPage() {
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId')?.trim() || undefined;

  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    const value = params.toString();
    return value ? `?${value}` : '';
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api<ProgressSummary>(`/api/progress/summary${query}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setSummary(data);
      })
      .catch((err) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
        setSummary(null);
        setError(err instanceof Error ? err.message : 'Could not load progress summary.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [query]);

  const backTo = userId ? `/coach?client=${encodeURIComponent(userId)}` : '/progress';
  const latestBloodPanel = summary?.bloodPanels[0] ?? null;

  return (
    <PrintExportLayout
      title="Progress report"
      subtitle={
        summary
          ? `${summary.client.name} · ${summary.program.name} · Generated ${new Date(summary.generatedAt).toLocaleString()}`
          : undefined
      }
      backTo={backTo}
      backLabel="Back to progress"
      printDisabled={loading || Boolean(error) || !summary}
      onPrint={() => {
        if (summary) printProgressReport(summary);
      }}
    >
      {loading && <p className="text-sm text-slate-500">Loading progress summary…</p>}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {summary && (
        <div className="space-y-10">
          <section>
            <h2 className="text-lg font-bold text-slate-900">Start · current · goal</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Metric</th>
                    <th className="px-4 py-3">Start</th>
                    <th className="px-4 py-3">Current</th>
                    <th className="px-4 py-3">Goal</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.metrics.map((metric) => (
                    <tr key={metric.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium">{metric.label}</td>
                      <td className="px-4 py-3">
                        {metric.startValue} {metric.unit}
                      </td>
                      <td className="px-4 py-3">
                        {metric.currentValue} {metric.unit}
                      </td>
                      <td className="px-4 py-3">
                        {metric.goalValue} {metric.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {summary.metricSnapshots.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-slate-900">Session snapshots</h2>
              <div className="mt-4 space-y-3">
                {summary.metricSnapshots.map((snapshot) => (
                  <div key={snapshot.id} className="rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{formatExportDate(snapshot.date)}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {snapshot.values
                        .map((value) => `${value.label}: ${value.currentValue} ${value.unit}`)
                        .join(' · ') || 'No values recorded'}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {summary.weightTrend.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-slate-900">Weight trend</h2>
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <tbody>
                    {summary.weightTrend.slice(-12).map((point) => (
                      <tr key={point.date} className="border-t border-slate-100 first:border-t-0">
                        <td className="px-4 py-2 text-slate-600">{formatExportDate(point.date)}</td>
                        <td className="px-4 py-2 font-medium">{point.weight} lbs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {summary.bodyCompositionTrend.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-slate-900">Body composition log</h2>
              <div className="mt-4 space-y-2">
                {summary.bodyCompositionTrend.slice(-8).map((point) => {
                  const parts = [
                    point.weight != null ? `${point.weight} lbs` : null,
                    point.bodyFat != null ? `${point.bodyFat}% body fat` : null,
                    point.waist != null ? `${point.waist}" waist` : null
                  ].filter(Boolean);
                  return (
                    <div key={point.date} className="flex flex-wrap justify-between gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm">
                      <span className="text-slate-600">{formatExportDate(point.date)}</span>
                      <span className="font-medium">{parts.join(' · ') || '—'}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {summary.progressPhotos.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-slate-900">Progress photos</h2>
              <div className="mt-4 space-y-2">
                {summary.progressPhotos.map((photoSet) => (
                  <div key={photoSet.id} className="flex justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm">
                    <span className="text-slate-600">{formatExportDate(photoSet.date)}</span>
                    <span className="font-medium">
                      {photoSet.photoCount} photo{photoSet.photoCount === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-lg font-bold text-slate-900">Blood panels</h2>
            <p className="mt-1 text-sm text-slate-600">
              Latest lab results with age/gender reference ranges per the blood panel spec.
            </p>
            {!latestBloodPanel ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No blood panels recorded yet.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{formatExportDate(latestBloodPanel.labDate)}</p>
                      {latestBloodPanel.labProvider ? (
                        <p className="text-sm text-slate-600">{latestBloodPanel.labProvider}</p>
                      ) : null}
                    </div>
                    {latestBloodPanel.enteredBy ? (
                      <p className="text-sm text-slate-500">Added by {latestBloodPanel.enteredBy.name}</p>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {latestBloodPanel.metrics.map((metric) => (
                      <BloodPanelMetricCard key={metric.key} metric={metric} />
                    ))}
                  </div>
                  {latestBloodPanel.notes ? (
                    <p className="mt-4 text-sm text-slate-700">
                      <span className="font-semibold">Notes:</span> {latestBloodPanel.notes}
                    </p>
                  ) : null}
                </div>

                {summary.bloodPanels.length > 1 && (
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Lab date</th>
                          <th className="px-4 py-3">Provider</th>
                          <th className="px-4 py-3">Metrics</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.bloodPanels.slice(1).map((panel) => (
                          <tr key={panel.id} className="border-t border-slate-100">
                            <td className="px-4 py-3">{formatExportDate(panel.labDate)}</td>
                            <td className="px-4 py-3">{panel.labProvider ?? '—'}</td>
                            <td className="px-4 py-3">
                              {panel.metrics.filter((metric) => metric.value != null).length} of 8
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </PrintExportLayout>
  );
}
