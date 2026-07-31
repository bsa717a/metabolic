import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Star, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { NumberInput } from '../components/ui/NumberInput';
import {
  FOOD_GROUPS,
  GROUP_COLORS,
  type BuilderFood,
  type FoodGroup,
  type FoodsByGroup
} from '../data/mealBuilderGroups';
import type { Food } from '../types';

type CardRole = 'STYLE' | 'PROTEIN' | 'FAT' | 'CARB' | 'VEGETABLE' | 'FRUIT' | 'FREE';

const EMPTY_FOODS_BY_GROUP: FoodsByGroup = {
  Protein: [],
  Fruits: [],
  Veggies: [],
  Fats: [],
  Carbs: []
};

type AdminOptionFood = {
  id: string;
  foodId: string;
  baseServings: number;
  scalable: boolean;
  discrete: boolean;
  unitStep: number;
  minServings: number | null;
  maxServings: number | null;
  food: Food;
};

type AdminOption = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  isDefault: boolean;
  sortOrder: number;
  visibleWhenOptionId?: string | null;
  foods: AdminOptionFood[];
};

type AdminCard = {
  id: string;
  role: CardRole;
  name: string;
  pickRule: string | null;
  required: boolean;
  maxSelect: number;
  sortOrder: number;
  options: AdminOption[];
};

type AdminCardSet = {
  id: string;
  name: string;
  slotType: 'BREAKFAST' | 'SNACK' | 'LUNCH' | 'DINNER';
  referenceCalories: number;
  cards: AdminCard[];
  _count: { templateMeals: number; userPicks: number };
};

/** Mirrors the server's serve-time scaling (mealCardScaling.resolveServings). */
function scaledPortion(line: AdminOptionFood, factor: number) {
  if (!line.scalable) return { servings: Number(line.baseServings), rounded: false };
  let servings = Number(line.baseServings) * factor;
  let rounded = false;
  if (line.discrete) {
    const step = Number(line.unitStep) > 0 ? Number(line.unitStep) : 1;
    const snapped = Math.max(step, Math.round(servings / step) * step);
    rounded = snapped !== servings;
    servings = snapped;
  }
  if (line.minServings != null && servings < Number(line.minServings)) servings = Number(line.minServings);
  if (line.maxServings != null && servings > Number(line.maxServings)) servings = Number(line.maxServings);
  return { servings: Math.round(servings * 100) / 100, rounded };
}

function FoodSearch({ onPick }: { onPick: (food: Food) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    const timer = window.setTimeout(() => {
      if (trimmed.length < 2) {
        setResults([]);
        return;
      }
      api<Food[]>(`/api/foods?query=${encodeURIComponent(trimmed)}`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search foods to add…"
        className="w-56 rounded-xl border border-app-border bg-app-surface px-3 py-1.5 text-sm"
      />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-72 overflow-y-auto rounded-xl border border-app-border bg-app-surface shadow-lg">
          {results.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-app-muted"
                onClick={() => {
                  onPick(food);
                  setQuery('');
                  setResults([]);
                }}
              >
                <span className="font-semibold">{food.name}</span>{' '}
                <span className="text-xs text-app-text-muted">
                  {food.servingSize} {food.servingUnit} · {Math.round(Number(food.calories))} kcal
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FoodMacroSidebar({
  catalog,
  loading,
  usedFoodIds,
  selectedSectionLabel,
  onPick
}: {
  catalog: FoodsByGroup;
  loading: boolean;
  usedFoodIds: Set<string>;
  selectedSectionLabel: string | null;
  onPick: (food: BuilderFood) => void;
}) {
  const [query, setQuery] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<FoodGroup, boolean>>(() =>
    Object.fromEntries(FOOD_GROUPS.map((group) => [group, true])) as Record<FoodGroup, boolean>
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FOOD_GROUPS.map((group) => {
      const foods = catalog[group].filter((food) => {
        if (!q) return true;
        return food.name.toLowerCase().includes(q) || (food.brand ?? '').toLowerCase().includes(q);
      });
      return { group, foods };
    });
  }, [catalog, query]);

  return (
    <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-hidden flex flex-col rounded-2xl border border-app-border bg-app-surface">
      <div className="border-b border-app-border px-3 py-3">
        <h2 className="text-sm font-bold">Food options</h2>
        <p className="mt-0.5 text-xs text-app-text-muted">
          {selectedSectionLabel
            ? `Click to add as a choosable option under “${selectedSectionLabel}”`
            : 'Select a step on the left, then click a food to add it as an option'}
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter foods…"
          className="mt-2 w-full rounded-xl border border-app-border bg-app-bg px-3 py-1.5 text-sm"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading && <p className="px-2 py-3 text-sm text-app-text-muted">Loading foods…</p>}
        {!loading &&
          filtered.map(({ group, foods }) => {
            const colors = GROUP_COLORS[group];
            const open = openGroups[group];
            return (
              <div key={group} className="mb-1">
                <button
                  type="button"
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [group]: !prev[group] }))}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide"
                  style={{ color: colors.text }}
                >
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{ backgroundColor: colors.bg, color: colors.text }}
                  >
                    {group}
                  </span>
                  <span className="font-semibold text-app-text-muted">{foods.length}</span>
                </button>
                {open && (
                  <ul className="mb-1 space-y-0.5 pl-1">
                    {foods.length === 0 && (
                      <li className="px-2 py-1 text-xs text-app-text-muted">No foods</li>
                    )}
                    {foods.map((food) => {
                      const used = usedFoodIds.has(food.id);
                      return (
                        <li key={food.id}>
                          <button
                            type="button"
                            disabled={!selectedSectionLabel}
                            title={
                              selectedSectionLabel
                                ? `Add “${food.name}” as an option`
                                : 'Select a step first'
                            }
                            onClick={() => onPick(food)}
                            className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-app-muted disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{food.name}</span>
                              <span className="block text-[11px] text-app-text-muted">
                                {food.servingSize} {food.servingUnit} · {Math.round(food.calories)} kcal
                                {used ? ' · already an option' : ''}
                              </span>
                            </span>
                            <Plus size={14} className="mt-0.5 shrink-0 text-brand-green" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
      </div>
    </aside>
  );
}

/** Filter token for the admin style path view. */
type StyleFilter = 'all' | 'always' | string;

function optionMatchesStyleFilter(option: AdminOption, filter: StyleFilter, isStyleCard: boolean): boolean {
  if (filter === 'all' || isStyleCard) return true;
  if (filter === 'always') return !option.visibleWhenOptionId;
  return !option.visibleWhenOptionId || option.visibleWhenOptionId === filter;
}

export function AdminMealCardSetEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [set, setSet] = useState<AdminCardSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState(500);
  const [styleFilter, setStyleFilter] = useState<StyleFilter>('all');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [foodCatalog, setFoodCatalog] = useState<FoodsByGroup>(EMPTY_FOODS_BY_GROUP);
  const [foodsLoading, setFoodsLoading] = useState(true);
  const [newCard, setNewCard] = useState({ role: 'PROTEIN' as CardRole, name: '' });

  const load = useCallback(() => {
    if (!id) return;
    api<AdminCardSet>(`/api/admin/card-sets/${id}`)
      .then((data) => {
        setSet(data);
        setPreviewTarget((current) => (current === 500 ? Math.round(Number(data.referenceCalories)) : current));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the card set'));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setFoodsLoading(true);
    api<FoodsByGroup>('/api/foods/by-group')
      .then(setFoodCatalog)
      .catch(() => setFoodCatalog(EMPTY_FOODS_BY_GROUP))
      .finally(() => setFoodsLoading(false));
  }, []);

  async function call(path: string, method: string, body?: unknown) {
    setError(null);
    try {
      await api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Change failed');
    }
  }

  /** Create a new choosable option on a step, with the food as its portion line. */
  async function addFoodAsOption(
    cardId: string,
    food: BuilderFood,
    visibleWhenOptionId: string | null
  ) {
    setError(null);
    try {
      const created = await api<{ id: string }>(`/api/admin/cards/${cardId}/options`, {
        method: 'POST',
        body: JSON.stringify({
          name: food.name.slice(0, 60),
          ...(visibleWhenOptionId ? { visibleWhenOptionId } : {})
        })
      });
      await api(`/api/admin/options/${created.id}/foods`, {
        method: 'POST',
        body: JSON.stringify({ foodId: food.id, baseServings: 1 })
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add option');
    }
  }

  if (!set) {
    return (
      <div className="space-y-4">
        <Link to="/admin" className="text-sm font-semibold text-brand-green">← Admin</Link>
        <p className="text-app-text-muted">{error ?? 'Loading…'}</p>
      </div>
    );
  }

  const factor = previewTarget > 0 && Number(set.referenceCalories) > 0 ? previewTarget / Number(set.referenceCalories) : 1;

  const styleCard = set.cards.find((card) => card.role === 'STYLE');
  const styleOptions = styleCard?.options ?? [];
  const styleFilterValid =
    styleFilter === 'all' ||
    styleFilter === 'always' ||
    styleOptions.some((option) => option.id === styleFilter);
  const activeStyleFilter: StyleFilter = styleFilterValid ? styleFilter : 'all';

  const selectedCard = set.cards.find((card) => card.id === selectedCardId) ?? null;
  const selectedSection =
    selectedCard && selectedCard.role !== 'STYLE' ? selectedCard : null;
  const usedFoodIds = new Set(
    (selectedSection?.options ?? []).flatMap((option) => option.foods.map((line) => line.foodId))
  );
  const gateForNewOptions =
    activeStyleFilter !== 'all' && activeStyleFilter !== 'always' ? activeStyleFilter : null;

  /** Options on earlier steps — used as path gates (Hot / Cold / …). */
  function earlierGateOptions(cardSortOrder: number) {
    return set.cards
      .filter((card) => card.sortOrder < cardSortOrder)
      .flatMap((card) =>
        card.options.map((option) => ({
          id: option.id,
          label: `${card.name}: ${option.name}`
        }))
      );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin" className="text-sm font-semibold text-brand-green">← Admin</Link>
          <h1 className="text-2xl font-bold">{set.name}</h1>
          <p className="text-sm text-app-text-muted">
            {set.slotType} · reference {Math.round(Number(set.referenceCalories))} kcal · backs {set._count.templateMeals} plan slot(s)
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {styleOptions.length > 0 && (
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-app-text-muted">Filter by style</span>
              <select
                value={activeStyleFilter}
                onChange={(e) => setStyleFilter(e.target.value as StyleFilter)}
                className="rounded-xl border border-app-border bg-app-surface px-3 py-2 text-sm"
              >
                <option value="all">All options</option>
                <option value="always">Always (shared)</option>
                {styleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.icon ? `${option.icon} ` : ''}
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase text-app-text-muted">Preview at target (kcal)</span>
            <NumberInput
              value={previewTarget}
              onChange={setPreviewTarget}
              className="w-28 rounded-xl border border-app-border bg-app-surface px-3 py-2 tabular-nums"
            />
          </label>
        </div>
      </div>

      {set._count.userPicks > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
          ⚠️ {set._count.userPicks} client(s) have standing picks in this set — editing portions or removing options
          changes what they get from tomorrow onward. Adding new options is always safe.
        </p>
      )}
      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          {set.cards.map((card, cardIndex) => {
            const isStyleCard = card.role === 'STYLE';
            const sectionSelected = selectedCardId === card.id && !isStyleCard;
            const visibleOptions = card.options.filter((option) =>
              optionMatchesStyleFilter(option, activeStyleFilter, isStyleCard)
            );
            const hiddenCount = card.options.length - visibleOptions.length;

            return (
              <Card
                key={card.id}
                className={`space-y-3 ${
                  sectionSelected
                    ? 'border-brand-green ring-1 ring-brand-green/40'
                    : ''
                }`}
              >
                <div
                  className={`flex flex-wrap items-center gap-2 ${isStyleCard ? '' : 'cursor-pointer'}`}
                  onClick={() => {
                    if (!isStyleCard) setSelectedCardId(card.id);
                  }}
                >
                  <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-xs font-bold text-brand-deep">
                    {cardIndex + 1} · {card.role}
                  </span>
                  <input
                    defaultValue={card.name}
                    onBlur={(e) => e.target.value !== card.name && void call(`/api/admin/cards/${card.id}`, 'PATCH', { name: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-lg border border-transparent bg-transparent px-2 py-1 text-base font-bold hover:border-app-border"
                  />
                  {sectionSelected && (
                    <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-[11px] font-semibold text-brand-deep">
                      Adding options here
                    </span>
                  )}
                  <input
                    defaultValue={card.pickRule ?? ''}
                    placeholder="pick rule (e.g. Pick 1 or more)"
                    onBlur={(e) => e.target.value !== (card.pickRule ?? '') && void call(`/api/admin/cards/${card.id}`, 'PATCH', { pickRule: e.target.value || null })}
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-48 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-app-text-muted hover:border-app-border"
                  />
                  <label className="flex items-center gap-1 text-xs text-app-text-muted" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={card.required}
                      onChange={(e) => void call(`/api/admin/cards/${card.id}`, 'PATCH', { required: e.target.checked })}
                    />
                    required
                  </label>
                  <label className="flex items-center gap-1 text-xs text-app-text-muted" onClick={(e) => e.stopPropagation()}>
                    max
                    <NumberInput
                      value={card.maxSelect}
                      commitOnBlur
                      integer
                      min={1}
                      onChange={(value) => {
                        if (value !== card.maxSelect) {
                          void call(`/api/admin/cards/${card.id}`, 'PATCH', { maxSelect: value });
                        }
                      }}
                      className="w-14 rounded-lg border border-app-border bg-app-surface px-1 py-0.5 tabular-nums"
                    />
                  </label>
                  {hiddenCount > 0 && (
                    <span className="text-xs text-app-text-muted">{hiddenCount} hidden by style filter</span>
                  )}
                  <button type="button" title="Move up" onClick={(e) => { e.stopPropagation(); void call(`/api/admin/cards/${card.id}/move`, 'POST', { direction: 'up' }); }} className="text-app-text-muted hover:text-app-text"><ArrowUp size={16} /></button>
                  <button type="button" title="Move down" onClick={(e) => { e.stopPropagation(); void call(`/api/admin/cards/${card.id}/move`, 'POST', { direction: 'down' }); }} className="text-app-text-muted hover:text-app-text"><ArrowDown size={16} /></button>
                  <button
                    type="button"
                    title="Delete card"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete the "${card.name}" step and all its options?`)) {
                        if (selectedCardId === card.id) setSelectedCardId(null);
                        void call(`/api/admin/cards/${card.id}`, 'DELETE');
                      }
                    }}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="space-y-2">
                  {visibleOptions.length === 0 && card.options.length > 0 && (
                    <p className="text-sm text-app-text-muted">No options match this style filter.</p>
                  )}
                  {visibleOptions.map((option) => (
                    <div key={option.id} className="rounded-xl border border-app-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          defaultValue={option.icon ?? ''}
                          placeholder="🍽️"
                          onBlur={(e) => e.target.value !== (option.icon ?? '') && void call(`/api/admin/options/${option.id}`, 'PATCH', { icon: e.target.value || null })}
                          className="w-12 rounded-lg border border-transparent bg-app-muted px-1 py-0.5 text-center hover:border-app-border"
                        />
                        <input
                          defaultValue={option.name}
                          onBlur={(e) => e.target.value !== option.name && void call(`/api/admin/options/${option.id}`, 'PATCH', { name: e.target.value })}
                          className="rounded-lg border border-transparent bg-transparent px-2 py-0.5 text-sm font-bold hover:border-app-border"
                        />
                        <button
                          type="button"
                          title={option.isDefault ? 'Default option' : 'Make default'}
                          onClick={() => !option.isDefault && void call(`/api/admin/options/${option.id}`, 'PATCH', { isDefault: true })}
                          className={option.isDefault ? 'text-brand-gold' : 'text-app-border hover:text-brand-gold'}
                        >
                          <Star size={16} fill={option.isDefault ? 'currentColor' : 'none'} />
                        </button>
                        {earlierGateOptions(card.sortOrder).length > 0 && (
                          <label className="flex items-center gap-1 text-xs text-app-text-muted">
                            Show
                            <select
                              value={option.visibleWhenOptionId ?? ''}
                              onChange={(e) =>
                                void call(`/api/admin/options/${option.id}`, 'PATCH', {
                                  visibleWhenOptionId: e.target.value ? e.target.value : null
                                })
                              }
                              className="max-w-[14rem] rounded-lg border border-app-border bg-app-surface px-1.5 py-0.5 text-xs text-app-text"
                            >
                              <option value="">Always</option>
                              {earlierGateOptions(card.sortOrder).map((gate) => (
                                <option key={gate.id} value={gate.id}>
                                  When: {gate.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <span className="ml-auto" />
                        <FoodSearch
                          onPick={(food) => void call(`/api/admin/options/${option.id}/foods`, 'POST', { foodId: food.id, baseServings: 1 })}
                        />
                        <button
                          type="button"
                          title="Delete option"
                          onClick={() => window.confirm(`Delete option "${option.name}"?`) && void call(`/api/admin/options/${option.id}`, 'DELETE')}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {option.foods.length > 0 && (
                        <table className="mt-2 w-full text-xs">
                          <thead>
                            <tr className="text-left uppercase tracking-wide text-app-text-muted">
                              <th className="py-1">Food</th>
                              <th>Base servings</th>
                              <th>Scales</th>
                              <th>Whole units</th>
                              <th className="text-brand-deep">@ {previewTarget} kcal</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {option.foods.map((line) => {
                              const preview = scaledPortion(line, factor);
                              const qty = Math.round(preview.servings * Number(line.food.servingSize) * 100) / 100;
                              const kcal = Math.round(preview.servings * Number(line.food.calories));
                              return (
                                <tr key={line.id} className="border-t border-app-muted">
                                  <td className="py-1 font-semibold">{line.food.name}</td>
                                  <td>
                                    <NumberInput
                                      step={0.1}
                                      min={0.1}
                                      commitOnBlur
                                      value={Number(line.baseServings)}
                                      onChange={(value) => {
                                        if (value !== Number(line.baseServings)) {
                                          void call(`/api/admin/option-foods/${line.id}`, 'PATCH', { baseServings: value });
                                        }
                                      }}
                                      className="w-20 rounded-lg border border-app-border bg-app-surface px-1 py-0.5 tabular-nums"
                                    />{' '}
                                    × {line.food.servingSize} {line.food.servingUnit}
                                  </td>
                                  <td>
                                    <input type="checkbox" checked={line.scalable} onChange={(e) => void call(`/api/admin/option-foods/${line.id}`, 'PATCH', { scalable: e.target.checked })} />
                                  </td>
                                  <td>
                                    <input type="checkbox" checked={line.discrete} onChange={(e) => void call(`/api/admin/option-foods/${line.id}`, 'PATCH', { discrete: e.target.checked })} />
                                  </td>
                                  <td className="font-semibold text-brand-deep tabular-nums">
                                    {qty} {line.food.servingUnit} · {kcal} kcal{preview.rounded ? ' (rounded)' : ''}
                                  </td>
                                  <td className="text-right">
                                    <button type="button" onClick={() => void call(`/api/admin/option-foods/${line.id}`, 'DELETE')} className="text-red-400 hover:text-red-600">
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      const name = window.prompt('New option name?');
                      if (name?.trim()) void call(`/api/admin/cards/${card.id}/options`, 'POST', { name: name.trim() });
                    }}
                  >
                    <Plus size={14} className="mr-1 inline" /> Add option
                  </Button>
                </div>
              </Card>
            );
          })}

          <Card className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-app-text-muted">New step role</span>
              <select
                value={newCard.role}
                onChange={(e) => setNewCard({ ...newCard, role: e.target.value as CardRole })}
                className="rounded-xl border border-app-border bg-app-surface px-3 py-2"
              >
                {(['STYLE', 'PROTEIN', 'CARB', 'VEGETABLE', 'FAT', 'FRUIT', 'FREE'] as const).map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-app-text-muted">Step name</span>
              <input
                value={newCard.name}
                onChange={(e) => setNewCard({ ...newCard, name: e.target.value })}
                placeholder="Choose protein"
                className="rounded-xl border border-app-border bg-app-surface px-3 py-2"
              />
            </label>
            <Button
              type="button"
              onClick={() => {
                if (!newCard.name.trim()) return;
                void call(`/api/admin/card-sets/${set.id}/cards`, 'POST', { role: newCard.role, name: newCard.name.trim() });
                setNewCard({ role: 'PROTEIN', name: '' });
              }}
              disabled={!newCard.name.trim()}
            >
              <Plus size={14} className="mr-1 inline" /> Add step
            </Button>
          </Card>
        </div>

        <FoodMacroSidebar
          catalog={foodCatalog}
          loading={foodsLoading}
          usedFoodIds={usedFoodIds}
          selectedSectionLabel={selectedSection?.name ?? null}
          onPick={(food) => {
            if (!selectedSection) return;
            void addFoodAsOption(selectedSection.id, food, gateForNewOptions);
          }}
        />
      </div>
    </div>
  );
}
