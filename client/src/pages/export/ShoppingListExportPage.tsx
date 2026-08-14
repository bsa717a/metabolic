import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays, api, formatWeekRange, startOfWeek, todayKey } from '../../services/api';
import type { ShoppingListResult } from '../../types';
import { formatPlannedMealContext } from '../../utils/shoppingListFormat';
import { printShoppingList } from '../../utils/printShoppingList';
import { PrintExportLayout } from '../../components/export/PrintExportLayout';

function formatRangeLabel(startDate: string, endDate: string) {
  if (startDate === endDate) return startDate;
  if (startDate === startOfWeek(startDate) && endDate === addDays(startDate, 6)) {
    return formatWeekRange(startDate);
  }
  return `${startDate} to ${endDate}`;
}

function parseDateParam(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export function ShoppingListExportPage() {
  const [searchParams] = useSearchParams();
  const startDate = parseDateParam(searchParams.get('startDate')) ?? startOfWeek(todayKey());
  const endDate = parseDateParam(searchParams.get('endDate')) ?? addDays(startDate, 6);
  const storeName = searchParams.get('storeName')?.trim() ?? '';

  const [result, setResult] = useState<ShoppingListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backTo = useMemo(() => {
    const anchor = searchParams.get('anchorDate');
    if (anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
      return anchor === todayKey() ? '/nutrition/plan' : `/nutrition/plan?date=${anchor}`;
    }
    return '/nutrition/plan';
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ startDate, endDate });
    if (storeName) params.set('storeName', storeName);

    api<ShoppingListResult>(`/api/nutrition/shopping-list?${params.toString()}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setResult(data);
      })
      .catch((err) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
        setResult(null);
        setError(err instanceof Error ? err.message : 'Could not load shopping list.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [startDate, endDate, storeName]);

  const title = result?.storeName ? `Shopping list · ${result.storeName}` : 'Shopping list';
  const subtitle = result
    ? `${formatRangeLabel(result.startDate, result.endDate)} · ${result.itemCount} item${result.itemCount === 1 ? '' : 's'}`
    : formatRangeLabel(startDate, endDate);

  return (
    <PrintExportLayout
      title={title}
      subtitle={subtitle}
      backTo={backTo}
      backLabel="Back to nutrition"
      printDisabled={loading || Boolean(error) || !result?.itemCount}
      onPrint={() => {
        if (result) printShoppingList(result);
      }}
    >
      {loading && <p className="text-sm text-slate-500">Building grocery list…</p>}
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {!loading && !error && result && (
        <>
          {result.intro && <p className="mb-6 text-sm text-slate-600 print:hidden">{result.intro}</p>}

          {result.itemCount === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              No planned foods in this range yet.
            </p>
          ) : (
            <div className="space-y-8 print:columns-2 print:gap-6 print:space-y-4">
              {result.sections.map((section) => (
                <section key={section.title} className="export-section break-inside-avoid print:mb-3">
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400 print:mb-1 print:text-[8px]">{section.title}</h2>
                  <ul className="overflow-hidden rounded-xl border border-slate-200 print:border-0">
                    {section.items.map((item) => (
                      <li key={item.id} className="flex gap-3 border-t border-slate-200 px-4 py-3 first:border-t-0 print:gap-2 print:border-0 print:px-0 print:py-0.5">
                        <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-slate-400 print:mt-0 print:h-2.5 print:w-2.5" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-3 print:gap-2">
                            <div>
                              <p className="font-medium text-slate-900 print:text-[9px] print:font-normal">{item.groceryDescription}</p>
                              <p className="mt-1 text-xs text-slate-500 print:hidden">{formatPlannedMealContext(item)}</p>
                              {item.notes && <p className="mt-1 text-xs text-slate-400 print:hidden">{item.notes}</p>}
                            </div>
                            {result.storeName && item.storeLocation && (
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 print:rounded-none print:bg-transparent print:px-0 print:py-0 print:text-[7px] print:font-normal print:text-slate-500">
                                {item.storeLocation}
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <p className="mt-8 text-xs text-slate-400 print:mt-3 print:text-[7px]">{result.note}</p>
        </>
      )}
    </PrintExportLayout>
  );
}
