import { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft } from 'lucide-react';
import { api } from '../../services/api';
import {
  defaultPicks,
  foodsLabel,
  missingCoverageRole,
  picksToSelections,
  restorePicks,
  selectionTotals,
  togglePick,
  type BuilderCard,
  type CardOption,
  type MealCardsPayload,
  type MealRecommendationsPayload,
  type RecommendedMeal,
  type BuilderPicks
} from '../../utils/mealCards';

export type { MealCardsPayload } from '../../utils/mealCards';

export function MealBuilder({
  open,
  date,
  payload,
  onClose,
  onSaved
}: {
  open: boolean;
  date: string;
  payload: MealCardsPayload | null;
  onClose: () => void;
  onSaved: (updated: MealCardsPayload) => void | Promise<void>;
}) {
  const cards = useMemo(
    () => (payload ? [...payload.cards].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [payload]
  );
  const [mode, setMode] = useState<'choose' | 'wizard' | 'recommend'>('choose');
  const [step, setStep] = useState(0); // cards.length = review step
  const [picks, setPicks] = useState<BuilderPicks>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [craving, setCraving] = useState('');
  const [recs, setRecs] = useState<MealRecommendationsPayload | null>(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<RecommendedMeal | null>(null);

  // Reset the wizard whenever it (re)opens — state adjustment during render, not an effect.
  const [prevOpenKey, setPrevOpenKey] = useState<string | null>(null);
  const openKey = open && payload ? `${payload.setId}:${payload.mealNumber}:${date}` : null;
  if (openKey !== prevOpenKey) {
    setPrevOpenKey(openKey);
    if (openKey && payload) {
      setMode('choose');
      setStep(0);
      setSaveError(null);
      setCraving('');
      setRecs(null);
      setRecError(null);
      setChosen(null);
      setPicks(
        payload.savedSelections?.setId === payload.setId
          ? restorePicks(cards, payload.savedSelections.picks)
          : defaultPicks(cards)
      );
    }
  }

  const totals = useMemo(() => selectionTotals(cards, picks), [cards, picks]);

  if (!payload) return null;

  const target = payload.targetCalories;
  const overBy = totals.calories - target;
  const inBand = Math.abs(overBy) <= target * 0.1;
  const missingRole = missingCoverageRole(cards, picks);

  const isReview = step >= cards.length;
  const currentCard = isReview ? null : cards[step];
  const stepPicked = currentCard ? (picks[currentCard.id] ?? []).length > 0 : true;
  const canAdvance = !currentCard || !currentCard.required || stepPicked;

  function toggleOption(card: BuilderCard, optionId: string) {
    setPicks((prev) => togglePick(card, prev, optionId));
  }

  async function save() {
    if (!payload) return;
    setSaving(true);
    setSaveError(null);
    try {
      const selections = picksToSelections(cards, picks);
      const updated = await api<MealCardsPayload>(`/api/daily-logs/${date}/meal-selections`, {
        method: 'POST',
        body: JSON.stringify({ mealNumber: payload.mealNumber, selections })
      });
      await onSaved(updated);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save your meal.');
    } finally {
      setSaving(false);
    }
  }

  const selectedLines = cards.flatMap((card) =>
    (picks[card.id] ?? [])
      .map((optionId) => card.options.find((o) => o.id === optionId))
      .filter((option): option is CardOption => Boolean(option))
      .map((option) => ({ card, option }))
  );

  async function loadRecommendations() {
    if (!payload) return;
    setMode('recommend');
    setChosen(null);
    setRecLoading(true);
    setRecError(null);
    try {
      const params = new URLSearchParams({ mealNumber: String(payload.mealNumber) });
      if (craving.trim()) params.set('craving', craving.trim());
      setRecs(await api<MealRecommendationsPayload>(`/api/daily-logs/${date}/meal-recommendations?${params}`));
    } catch (err) {
      setRecs(null);
      setRecError(err instanceof Error ? err.message : 'Could not get recommendations.');
    } finally {
      setRecLoading(false);
    }
  }

  async function saveRecommendation(option: RecommendedMeal) {
    if (!payload) return;
    setSaving(true);
    setRecError(null);
    try {
      await api(`/api/daily-logs/${date}/meal-recommendation`, {
        method: 'POST',
        body: JSON.stringify({
          mealNumber: payload.mealNumber,
          suggestion: { name: option.name, description: option.description, items: option.items }
        })
      });
      await onSaved(payload); // payload unchanged; the parent reloads the week
      onClose();
    } catch (err) {
      setRecError(err instanceof Error ? err.message : 'Could not save that meal.');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className={clsx('fixed inset-0 z-50', open ? 'pointer-events-auto' : 'pointer-events-none')}>
      <div
        className={clsx('absolute inset-0 bg-slate-950/40 transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        className={clsx(
          'absolute inset-x-0 bottom-0 top-0 flex flex-col bg-app-bg transition-transform sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(720px,92vh)] sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:overflow-hidden sm:rounded-3xl sm:shadow-2xl',
          open ? 'translate-y-0' : 'translate-y-full sm:translate-y-[calc(-50%+100vh)]'
        )}
      >
        {/* Header */}
        <div className="shrink-0 bg-brand-navy px-5 pb-4 pt-4 text-brand-off-white">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green-light"
              onClick={() => {
                if (mode === 'choose') return onClose();
                if (mode === 'recommend') {
                  if (chosen) return setChosen(null);
                  return setMode('choose');
                }
                if (step === 0) return setMode('choose');
                setStep((s) => s - 1);
              }}
            >
              <ChevronLeft size={16} />
              {mode === 'choose' ? 'Close' : 'Back'}
            </button>
            {mode === 'wizard' && (
              <span className="text-xs font-medium text-brand-off-white/70">
                Step {Math.min(step + 1, cards.length + 1)} of {cards.length + 1}
              </span>
            )}
          </div>
          {mode === 'wizard' && (
            <div className="mt-3 flex gap-1.5">
              {[...cards, null].map((_, index) => (
                <span
                  key={index}
                  className={clsx(
                    'h-1 flex-1 rounded-full',
                    index < step ? 'bg-brand-green-light' : index === step ? 'bg-brand-gold' : 'bg-white/20'
                  )}
                />
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            {mode === 'wizard' && (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-green text-xs font-bold text-white">
                {Math.min(step + 1, cards.length + 1)}
              </span>
            )}
            <h2 className="text-base font-bold uppercase tracking-wide">
              {mode === 'choose' && `Build ${payload.mealName}`}
              {mode === 'recommend' && (chosen ? chosen.name : '✨ Recommended for you')}
              {mode === 'wizard' && (isReview ? 'Review your meal' : currentCard?.name)}
            </h2>
          </div>
          <p className="mt-1 text-xs font-semibold text-brand-green-light">
            {mode === 'choose' && `Target ${payload.targetCalories} kcal — pick your path`}
            {mode === 'recommend' && `Complete meals fit to your ${payload.targetCalories} kcal target`}
            {mode === 'wizard' &&
              (isReview
                ? 'Everything is scaled to your target'
                : currentCard?.pickRule ?? (currentCard?.maxSelect === 1 ? 'Pick 1' : 'Pick 1 or more'))}
          </p>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {mode === 'choose' && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => void loadRecommendations()}
                className="w-full rounded-2xl border-2 border-brand-green bg-brand-green/5 px-4 py-4 text-left transition hover:bg-brand-green/10"
              >
                <span className="block text-base font-bold text-app-text">✨ Recommend meals for me</span>
                <span className="mt-1 block text-sm text-app-text-muted">
                  Complete meals that fit your target — tap one and you're done.
                </span>
              </button>
              <input
                type="text"
                value={craving}
                onChange={(e) => setCraving(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void loadRecommendations()}
                placeholder="Optional: what sounds good? (“something spicy”, “no fish tonight”)"
                className="w-full rounded-xl border border-app-border bg-app-surface px-3.5 py-2.5 text-sm text-app-text placeholder:text-app-text-muted focus:border-brand-green focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setMode('wizard')}
                className="w-full rounded-2xl border-2 border-app-border bg-app-surface px-4 py-4 text-left transition hover:border-brand-green-light"
              >
                <span className="block text-base font-bold text-app-text">🃏 Build it myself</span>
                <span className="mt-1 block text-sm text-app-text-muted">
                  Step through the cards: {cards.map((c) => c.name.toLowerCase().replace('choose ', '').replace('add ', '')).join(' → ')}.
                </span>
              </button>
            </div>
          )}

          {mode === 'recommend' && (
            <div className="space-y-3">
              {recLoading && (
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-24 animate-pulse rounded-2xl bg-app-muted" />
                  ))}
                  <p className="text-center text-xs text-app-text-muted">Cooking up ideas…</p>
                </div>
              )}

              {recError && (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {recError}
                  <button type="button" onClick={() => void loadRecommendations()} className="ml-2 font-bold underline">
                    Try again
                  </button>
                </div>
              )}

              {!recLoading && !chosen && recs && (
                <>
                  {recs.options.map((option) => (
                    <button
                      key={option.name}
                      type="button"
                      onClick={() => setChosen(option)}
                      className="w-full rounded-2xl border-2 border-app-border bg-app-surface px-4 py-3 text-left transition hover:border-brand-green-light"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-app-text">{option.name}</span>
                        <span className="shrink-0 text-xs font-semibold text-app-text-muted">
                          {option.totals.calories} kcal · {Math.round(option.totals.protein)}p
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-app-text-muted">{option.description}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {option.bloodSugarStable && (
                          <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-[10px] font-bold text-brand-deep">🩸 stable</span>
                        )}
                        {option.withinBand ? (
                          <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-[10px] font-bold text-brand-deep">✓ in range</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">near target</span>
                        )}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => void loadRecommendations()}
                    className="w-full rounded-xl border border-app-border bg-app-surface px-4 py-2.5 text-sm font-semibold text-app-text transition hover:bg-app-muted"
                  >
                    Show me different ones
                  </button>
                  <p className="text-center text-xs text-app-text-muted">
                    AI-estimated portions and macros — double-check ingredients if you have allergies.
                  </p>
                </>
              )}

              {chosen && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                    <p className="text-sm text-app-text-muted">{chosen.description}</p>
                    <ul className="mt-2 divide-y divide-app-muted">
                      {chosen.items.map((item) => (
                        <li key={item.name} className="flex items-baseline gap-2 py-1.5 text-sm">
                          <Check size={14} className="shrink-0 self-center text-brand-green" strokeWidth={3} />
                          <span className="min-w-0 flex-1 text-app-text">{item.name}</span>
                          <span className="shrink-0 text-xs font-semibold text-brand-green">
                            {item.quantity} {item.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-lg font-bold text-app-text">
                      {chosen.totals.calories} kcal{' '}
                      <span className="text-xs font-semibold text-app-text-muted">
                        target {recs?.targetCalories ?? payload.targetCalories} (±10%)
                      </span>
                    </p>
                  </div>
                  <p className="text-center text-xs text-app-text-muted">
                    Saving makes this your {payload.setName.toLowerCase().replace(' builder', '').replace(' night', '')} for the
                    rest of the week — rebuild any day to change it from there on.
                  </p>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveRecommendation(chosen)}
                    className="w-full rounded-xl bg-brand-green px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-deep disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Add to plan'}
                  </button>
                </div>
              )}
            </div>
          )}

          {mode === 'wizard' && !isReview && currentCard && (
            <div className="space-y-2.5">
              {currentCard.options.map((option) => {
                const selected = (picks[currentCard.id] ?? []).includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleOption(currentCard, option.id)}
                    className={clsx(
                      'flex w-full items-center gap-3 rounded-2xl border-2 bg-app-surface px-3.5 py-3 text-left transition',
                      selected ? 'border-brand-green bg-brand-green/5' : 'border-app-border hover:border-brand-green-light'
                    )}
                  >
                    {option.foods[0]?.imageUrl ? (
                      <img
                        src={option.foods[0].imageUrl}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-xl bg-app-muted object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-green/15 to-brand-gold/20 text-3xl">
                        {option.icon ?? '🍽️'}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-app-text">{option.name}</span>
                      <span className="block text-xs font-semibold text-brand-green">{foodsLabel(option)}</span>
                      {option.foods.length > 0 && (
                        <span className="block text-xs text-app-text-muted">
                          {Math.round(option.totals.calories)} kcal · {Math.round(option.totals.protein)}p /{' '}
                          {Math.round(option.totals.carbs)}c / {Math.round(option.totals.fat)}f
                        </span>
                      )}
                    </span>
                    <span
                      className={clsx(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                        selected ? 'border-brand-green bg-brand-green text-white' : 'border-app-border text-transparent'
                      )}
                    >
                      <Check size={13} strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {mode === 'wizard' && isReview && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                <h3 className="text-base font-bold text-app-text">{payload.setName}</h3>
                <ul className="mt-2 divide-y divide-app-muted">
                  {selectedLines.map(({ option }) =>
                    option.foods.length ? (
                      option.foods.map((food) => (
                        <li key={`${option.id}-${food.foodId}`} className="flex items-baseline gap-2 py-1.5 text-sm">
                          <Check size={14} className="shrink-0 self-center text-brand-green" strokeWidth={3} />
                          <span className="min-w-0 flex-1 text-app-text">{food.name}</span>
                          <span className="shrink-0 text-xs font-semibold text-brand-green">
                            {food.quantity} {food.unit}
                          </span>
                        </li>
                      ))
                    ) : (
                      <li key={option.id} className="flex items-baseline gap-2 py-1.5 text-sm">
                        <Check size={14} className="shrink-0 self-center text-brand-green" strokeWidth={3} />
                        <span className="text-app-text">{option.name}</span>
                      </li>
                    )
                  )}
                </ul>
                <p className="mt-3 text-lg font-bold text-app-text">
                  {totals.calories} kcal{' '}
                  <span className="text-xs font-semibold text-app-text-muted">target {target} (±10%)</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {missingRole ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                      Missing a {missingRole.toLowerCase()} — pairing keeps blood sugar steadier
                    </span>
                  ) : (
                    <span className="rounded-full bg-brand-green/15 px-3 py-1 text-xs font-semibold text-brand-deep">
                      🩸 Blood-sugar stable
                    </span>
                  )}
                  {inBand ? (
                    <span className="rounded-full bg-brand-green/15 px-3 py-1 text-xs font-semibold text-brand-deep">
                      ✓ In your range
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                      ~{Math.abs(Math.round(overBy))} kcal {overBy > 0 ? 'over' : 'under'} — that's okay, just a heads-up
                    </span>
                  )}
                </div>
              </div>
              <p className="text-center text-xs text-app-text-muted">
                Saving makes this your {payload.setName.toLowerCase().replace(' builder', '')} for the rest of the
                week — rebuild on any day to change it from there on. Go back to swap any card; portions rebalance
                automatically.
              </p>
              {saveError && (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</div>
              )}
            </div>
          )}
        </div>

        {/* Sticky footer (wizard only) */}
        {mode === 'wizard' && (
        <div className="shrink-0 border-t border-app-border bg-app-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-bold text-app-text">{totals.calories} kcal so far</p>
              <p className="text-xs text-app-text-muted">{payload.setName} · target {target} (±10%)</p>
            </div>
            {isReview ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-xl bg-brand-green px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Add to plan'}
              </button>
            ) : (
              <button
                type="button"
                disabled={!canAdvance}
                onClick={() => setStep((s) => s + 1)}
                className="rounded-xl bg-brand-green px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
              >
                {step === cards.length - 1 ? 'Review meal' : 'Next'}
              </button>
            )}
          </div>
        </div>
        )}
      </div>
    </div>,
    document.body
  );
}
