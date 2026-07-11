import { useEffect, useMemo, useState } from 'react';
import { Printer, Share2 } from 'lucide-react';
import { addDays, api, formatWeekRange, startOfWeek, todayKey } from '../../services/api';
import type { MealPrepPlanResult } from '../../types';
import { printMealPrep } from '../../utils/printMealPrep';
import {
  formatContainerCount,
  formatFreshServingScope,
  formatPrepDate,
  formatPrepQuantity,
  pluralizePrepUnit,
  shareMealPrep
} from '../../utils/mealPrepFormat';
import { Button } from '../ui/Button';
import { Drawer } from '../ui/Drawer';

const iconButtonClassName = 'px-2.5';

type RangePreset = 'this-week' | 'next-7-days';

function formatRangeLabel(startDate: string, endDate: string) {
  if (startDate === endDate) return startDate;
  if (startDate === startOfWeek(startDate) && endDate === addDays(startDate, 6)) {
    return formatWeekRange(startDate);
  }
  return `${startDate} to ${endDate}`;
}

function getPresetRange(preset: RangePreset, anchorDate: string) {
  if (preset === 'next-7-days') {
    const startDate = todayKey();
    return { startDate, endDate: addDays(startDate, 6) };
  }

  const startDate = startOfWeek(anchorDate);
  return { startDate, endDate: addDays(startDate, 6) };
}

export function MealPrepDrawer({
  open,
  anchorDate,
  onClose
}: {
  open: boolean;
  anchorDate: string;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<RangePreset>('this-week');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [result, setResult] = useState<MealPrepPlanResult | null>(null);

  const range = useMemo(() => getPresetRange(preset, anchorDate), [preset, anchorDate]);
  const currentResult =
    result?.startDate === range.startDate && result.endDate === range.endDate ? result : null;

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ startDate: range.startDate, endDate: range.endDate });

      api<MealPrepPlanResult>(`/api/nutrition/meal-prep?${params.toString()}`, { signal: controller.signal })
        .then((data) => {
          if (controller.signal.aborted) return;
          setResult(data);
        })
        .catch((err) => {
          if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
          setResult(null);
          setError(err instanceof Error ? err.message : 'Could not load meal prep plan.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    });

    return () => controller.abort();
  }, [open, range.startDate, range.endDate]);

  function handlePrint() {
    if (!currentResult?.batchCount) return;
    setPrintError(null);
    try {
      printMealPrep(currentResult);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Could not open print view.');
    }
  }

  async function handleShare() {
    if (!currentResult?.batchCount || sharing) return;
    setShareError(null);
    setSharing(true);
    try {
      await shareMealPrep(currentResult);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setShareError(err instanceof Error ? err.message : 'Could not share meal prep plan.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <Drawer open={open} title="Meal prep" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="text-sm text-app-text opacity-80">
            Meals you planned more than once become batches: cook each batch once, portion it into containers, and label
            them by day.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant={preset === 'this-week' ? 'primary' : 'secondary'} onClick={() => setPreset('this-week')}>
              This week
            </Button>
            <Button type="button" variant={preset === 'next-7-days' ? 'primary' : 'secondary'} onClick={() => setPreset('next-7-days')}>
              Next 7 days
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={iconButtonClassName}
              onClick={handlePrint}
              disabled={loading || !currentResult?.batchCount}
              aria-label="Print or save PDF"
              title="Print or save PDF"
            >
              <Printer className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={iconButtonClassName}
              onClick={handleShare}
              disabled={loading || sharing || !currentResult?.batchCount}
              aria-label="Send via SMS or WhatsApp"
              title="Send via SMS or WhatsApp"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
          {(printError || shareError) && (
            <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{printError ?? shareError}</p>
          )}
          <p className="mt-3 text-sm font-medium text-app-text">{formatRangeLabel(range.startDate, range.endDate)}</p>
        </div>

        {loading && <p className="text-sm text-app-text opacity-80">Building your prep plan...</p>}
        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {!loading && !error && currentResult && (
          <>
            {currentResult.intro && <p className="text-sm text-app-text opacity-80">{currentResult.intro}</p>}

            <p className="text-sm text-app-text opacity-80">
              {currentResult.batchCount} batch{currentResult.batchCount === 1 ? '' : 'es'} ·{' '}
              {currentResult.containerCount} container
              {currentResult.containerCount === 1 ? '' : 's'} across {currentResult.plannedDayCount} planned day
              {currentResult.plannedDayCount === 1 ? '' : 's'}.
              {!currentResult.enriched && currentResult.batchCount > 0
                ? ' Using rule-based container suggestions.'
                : ''}
            </p>

            {currentResult.batchCount === 0 ? (
              <div className="rounded-2xl border border-dashed border-app-border px-4 py-8 text-center text-sm text-app-text opacity-80">
                No planned meals in this range yet. Plan a few days — repeated meals turn into prep batches.
              </div>
            ) : (
              <div className="space-y-5">
                {currentResult.batches.map((batch) => (
                  <section key={batch.id} className="rounded-2xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">
                            {batch.label} <span className="font-normal text-slate-400">× {batch.occurrenceCount}</span>
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">
                            Label: {batch.dates.map(formatPrepDate).join(', ')}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                          {formatContainerCount(batch)} · {batch.container}
                        </span>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cook now</p>
                      <ul className="mt-1 space-y-1">
                        {batch.cookNow.map((item) => (
                          <li key={`${item.name}-${item.unit}`} className="text-sm text-slate-700">
                            {formatPrepQuantity(item.totalQuantity)} {pluralizePrepUnit(item.unit, item.totalQuantity)}{' '}
                            {item.name}
                          </li>
                        ))}
                        {batch.cookNow.length === 0 && (
                          <li className="text-sm text-slate-400">Nothing to cook ahead — assemble at serving.</li>
                        )}
                      </ul>
                      {batch.addFresh.length > 0 && (
                        <>
                          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Add fresh at serving
                          </p>
                          <ul className="mt-1 space-y-1">
                            {batch.addFresh.map((item) => (
                              <li key={`${item.name}-${item.unit}`} className="text-sm text-slate-700">
                                {formatPrepQuantity(item.quantityPerServing)}{' '}
                                {pluralizePrepUnit(item.unit, item.quantityPerServing)} {item.name}
                                {formatFreshServingScope(item, batch)}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {(batch.reheat || batch.storageNote) && (
                        <p className="mt-3 text-xs text-slate-500">
                          {batch.reheat ? `Reheat: ${batch.reheat}` : null}
                          {batch.reheat && batch.storageNote ? ' ' : null}
                          {batch.storageNote ? `Storage: ${batch.storageNote}` : null}
                        </p>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            )}

            <p className="text-xs text-app-text opacity-80">{currentResult.note}</p>
          </>
        )}
      </div>
    </Drawer>
  );
}
