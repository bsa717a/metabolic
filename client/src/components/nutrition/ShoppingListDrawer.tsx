import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, Printer, Share2, ShoppingBag } from 'lucide-react';
import { clsx } from 'clsx';
import { addDays, api, formatWeekRange, startOfWeek, todayKey } from '../../services/api';
import type { InstacartShoppingListLink, InstacartStatus, ShoppingListResult } from '../../types';
import { printShoppingList } from '../../utils/printShoppingList';
import { formatPlannedMealContext, shareShoppingList } from '../../utils/shoppingListFormat';
import { readSavedSupermarket, saveSupermarket } from '../../utils/shoppingListPreferences';
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

export function ShoppingListDrawer({
  open,
  anchorDate,
  onClose
}: {
  open: boolean;
  anchorDate: string;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<RangePreset>('this-week');
  const [storeName, setStoreName] = useState(readSavedSupermarket);
  const [appliedStoreName, setAppliedStoreName] = useState(readSavedSupermarket);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [storeSectionOpen, setStoreSectionOpen] = useState(false);
  const [result, setResult] = useState<ShoppingListResult | null>(null);
  const [instacartConfigured, setInstacartConfigured] = useState(false);
  const [instacartLoading, setInstacartLoading] = useState(false);
  const [instacartError, setInstacartError] = useState<string | null>(null);

  const range = useMemo(() => getPresetRange(preset, anchorDate), [preset, anchorDate]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams(range);
    if (appliedStoreName.trim()) {
      params.set('storeName', appliedStoreName.trim());
    }

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
  }, [open, range.startDate, range.endDate, appliedStoreName]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    api<InstacartStatus>('/api/nutrition/instacart/status', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setInstacartConfigured(data.configured);
      })
      .catch(() => {
        if (!controller.signal.aborted) setInstacartConfigured(false);
      });

    return () => controller.abort();
  }, [open]);

  function applyStoreName() {
    const trimmed = storeName.trim();
    setAppliedStoreName(trimmed);
    saveSupermarket(trimmed);
  }

  function shoppingListExportPath() {
    const params = new URLSearchParams({
      startDate: range.startDate,
      endDate: range.endDate,
      anchorDate
    });
    if (appliedStoreName.trim()) {
      params.set('storeName', appliedStoreName.trim());
    }
    return `/nutrition/shopping-list/export?${params.toString()}`;
  }

  function handlePrint() {
    if (!result?.itemCount) return;
    setPrintError(null);
    try {
      printShoppingList(result);
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Could not open print view.');
    }
  }

  async function handleShare() {
    if (!result?.itemCount || sharing) return;
    setShareError(null);
    setSharing(true);
    try {
      await shareShoppingList(result);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setShareError(err instanceof Error ? err.message : 'Could not share shopping list.');
    } finally {
      setSharing(false);
    }
  }

  async function handleInstacartOrder() {
    if (!result?.itemCount || instacartLoading || !instacartConfigured) return;

    setInstacartError(null);
    setInstacartLoading(true);
    try {
      const payload: Record<string, string | number> = {
        startDate: range.startDate,
        endDate: range.endDate
      };
      if (appliedStoreName.trim()) {
        payload.storeName = appliedStoreName.trim();
      }

      const link = await api<InstacartShoppingListLink>('/api/nutrition/shopping-list/instacart-link', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      window.open(link.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setInstacartError(err instanceof Error ? err.message : 'Could not open Instacart.');
    } finally {
      setInstacartLoading(false);
    }
  }

  return (
    <Drawer open={open} title="Shopping list" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="text-sm text-slate-500">
            AI converts your planned foods into grocery-store amounts. Add a store name for approximate aisle hints.
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
              disabled={loading || !result?.itemCount}
              aria-label="Quick print"
              title="Quick print"
            >
              <Printer className="h-4 w-4" />
            </Button>
            <a
              href={shoppingListExportPath()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open printable shopping list"
              title="Open printable shopping list"
              className={`inline-flex items-center justify-center rounded-xl bg-app-surface px-2.5 py-2 text-app-text ring-1 ring-inset ring-app-border transition hover:bg-app-muted ${
                loading || !result?.itemCount ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              <span className="text-xs font-semibold">PDF</span>
            </a>
            <Button
              type="button"
              variant="secondary"
              className={iconButtonClassName}
              onClick={handleShare}
              disabled={loading || sharing || !result?.itemCount}
              aria-label="Send via SMS or WhatsApp"
              title="Send via SMS or WhatsApp"
            >
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
          {(printError || shareError) && (
            <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{printError ?? shareError}</p>
          )}
          <p className="mt-3 text-sm font-medium text-slate-700">{formatRangeLabel(range.startDate, range.endDate)}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-slate-700"
            aria-expanded={storeSectionOpen}
            onClick={() => setStoreSectionOpen((open) => !open)}
          >
            <span>
              Supermarket (optional)
              {appliedStoreName ? <span className="font-normal text-slate-500"> · {appliedStoreName}</span> : null}
            </span>
            <ChevronDown className={clsx('h-4 w-4 shrink-0 text-slate-400 transition-transform', storeSectionOpen && 'rotate-180')} />
          </button>
          {storeSectionOpen && (
            <div className="border-t border-slate-200 px-4 pb-4 pt-3">
              <label className="sr-only" htmlFor="shopping-store-name">
                Supermarket (optional)
              </label>
              <div className="flex gap-2">
                <input
                  id="shopping-store-name"
                  value={storeName}
                  onChange={(event) => setStoreName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') applyStoreName();
                  }}
                  placeholder="e.g. Kroger, Whole Foods, Publix"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-brand-green/30 focus:ring-2"
                />
                <Button type="button" variant="secondary" onClick={applyStoreName}>
                  Apply
                </Button>
              </div>
              {(result?.storeName || appliedStoreName) && (
                <p className="mt-2 text-xs text-slate-500">
                  {result?.storeName
                    ? `Showing aisle hints for ${result.storeName}.`
                    : `Using ${appliedStoreName} for aisle hints.`}{' '}
                  This store is saved for future shopping lists.
                </p>
              )}
            </div>
          )}
        </div>

        {loading && <p className="text-sm text-slate-500">Building your grocery list...</p>}
        {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        {!loading && !error && result && (
          <>
            {result.intro && <p className="text-sm text-slate-600">{result.intro}</p>}

            <p className="text-sm text-slate-500">
              {result.itemCount} grocery item{result.itemCount === 1 ? '' : 's'} across {result.plannedDayCount} planned day
              {result.plannedDayCount === 1 ? '' : 's'}.
              {!result.enriched && result.itemCount > 0 ? ' Using estimated amounts.' : ''}
            </p>

            {result.itemCount > 0 && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="primary"
                  className="w-full justify-center gap-2"
                  onClick={handleInstacartOrder}
                  disabled={loading || instacartLoading || !instacartConfigured}
                >
                  <ShoppingBag className="h-4 w-4" />
                  {instacartLoading ? 'Opening Instacart…' : 'Order pickup on Instacart'}
                  {!instacartLoading && <ExternalLink className="h-3.5 w-3.5 opacity-70" />}
                </Button>
                {instacartConfigured ? (
                  <p className="text-xs text-slate-500">
                    Opens Instacart in a new tab. Choose your store (including Walmart), review matched products, select a pickup
                    time, and check out there.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">Instacart ordering will appear here once the server API key is configured.</p>
                )}
                {instacartError && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{instacartError}</p>}
              </div>
            )}

            {result.itemCount === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No planned foods in this range yet. Add planned items to your meals to build a shopping list.
              </div>
            ) : (
              <div className="space-y-5">
                {result.sections.map((section) => (
                  <section key={section.title}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{section.title}</h3>
                    <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
                      {section.items.map((item) => (
                        <li key={item.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-900">{item.groceryDescription}</p>
                              <p className="mt-1 text-xs text-slate-500">{formatPlannedMealContext(item)}</p>
                              {item.notes && <p className="mt-1 text-xs text-slate-400">{item.notes}</p>}
                            </div>
                            {result.storeName && item.storeLocation && (
                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                                {item.storeLocation}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            <p className="text-xs text-slate-400">{result.note}</p>
          </>
        )}
      </div>
    </Drawer>
  );
}
