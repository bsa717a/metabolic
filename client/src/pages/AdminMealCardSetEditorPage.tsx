import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Pencil, Plus, Sparkles, Star, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { NumberInput } from '../components/ui/NumberInput';
import { FoodSearch } from '../components/nutrition/FoodSearch';
import { LogDifferentFoodModal } from '../components/nutrition/LogDifferentFoodModal';
import { foodEmoji } from '../utils/foodEmoji';
import {
  FOOD_GROUPS,
  GROUP_COLORS,
  type BuilderFood,
  type FoodGroup,
  type FoodsByGroup
} from '../data/mealBuilderGroups';
import type { Food } from '../types';

type CardRole = 'STYLE' | 'PROTEIN' | 'FAT' | 'CARB' | 'VEGETABLE' | 'FRUIT' | 'FREE';

const ROLE_TO_FOOD_GROUP: Partial<Record<CardRole, FoodGroup>> = {
  PROTEIN: 'Protein',
  FRUIT: 'Fruits',
  VEGETABLE: 'Veggies',
  FAT: 'Fats',
  CARB: 'Carbs'
};

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
  visibleWhenOptionId?: string | null;
  hiddenForOptionIds?: string[];
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

function RecentFoodRow({
  food,
  canAdd,
  onAdd
}: {
  food: Food;
  canAdd: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 shrink-0 text-center" aria-hidden>
        {foodEmoji(food.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-app-text">{food.name}</p>
        <p className="truncate text-xs text-app-text-muted">
          {Math.round(Number(food.calories))} kcal · {Math.round(Number(food.protein))}g P
        </p>
      </div>
      <button
        type="button"
        aria-label={`Add ${food.name} as an option`}
        title={canAdd ? 'Add as an option' : 'Select a step first'}
        disabled={!canAdd}
        onClick={onAdd}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-app-muted text-app-text transition hover:bg-brand-green/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}

function FoodMacroSidebar({
  catalog,
  loading,
  usedFoodIds,
  selectedSectionLabel,
  suggestedGroup,
  onPick
}: {
  catalog: FoodsByGroup;
  loading: boolean;
  usedFoodIds: Set<string>;
  selectedSectionLabel: string | null;
  suggestedGroup: FoodGroup | null;
  onPick: (food: Pick<BuilderFood, 'id' | 'name'>) => void | Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<FoodGroup | 'all'>('all');
  const [openGroups, setOpenGroups] = useState<Record<FoodGroup, boolean>>(() =>
    Object.fromEntries(FOOD_GROUPS.map((group) => [group, true])) as Record<FoodGroup, boolean>
  );
  const [recent, setRecent] = useState<Food[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const canAdd = Boolean(selectedSectionLabel) && !busy;

  useEffect(() => {
    api<Food[]>('/api/foods/recent')
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    setGroupFilter(suggestedGroup ?? 'all');
  }, [suggestedGroup]);

  async function pickFood(food: Pick<BuilderFood, 'id' | 'name'>) {
    if (!selectedSectionLabel || busy) return;
    setBusy(true);
    try {
      await onPick(food);
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FOOD_GROUPS.filter((group) => groupFilter === 'all' || group === groupFilter).map((group) => {
      const foods = catalog[group].filter((food) => {
        if (!q) return true;
        return food.name.toLowerCase().includes(q) || (food.brand ?? '').toLowerCase().includes(q);
      });
      return { group, foods };
    });
  }, [catalog, query, groupFilter]);

  return (
    <aside className="nutrition-ui-lg lg:sticky lg:top-[var(--app-sticky-offset)] lg:max-h-[calc(100vh-var(--app-sticky-offset)-1rem)] flex flex-col self-start rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm lg:overflow-hidden">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-app-text-muted">Add foods</h3>
        <p className="mt-1 text-xs text-app-text-muted">
          {selectedSectionLabel ? (
            <>
              Adding to <span className="font-medium text-app-text">{selectedSectionLabel}</span>
            </>
          ) : (
            'Select a step on the left to add foods as options.'
          )}
        </p>

        <div className="mt-3 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <FoodSearch onSelect={pickFood} />
          </div>
          <button
            type="button"
            aria-label="Describe a food for AI to estimate"
            title={canAdd ? 'Describe a food (AI estimate)' : 'Select a step first'}
            disabled={!canAdd}
            onClick={() => setAiOpen(true)}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-app-border bg-app-surface text-brand-green transition hover:bg-brand-green/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles size={20} />
          </button>
        </div>

        <LogDifferentFoodModal
          open={aiOpen}
          title={selectedSectionLabel ? `Add food to ${selectedSectionLabel}` : 'Add food'}
          onClose={() => setAiOpen(false)}
          onFoodAccepted={async (foods) => {
            for (const food of foods) {
              await pickFood(food);
            }
          }}
        />

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-text-muted">Recent</p>
          {recent.length === 0 ? (
            <p className="text-sm text-app-text-muted">No recent foods yet.</p>
          ) : (
            <div className="space-y-2.5">
              {recent.slice(0, 10).map((food, index) => (
                <RecentFoodRow
                  key={`${food.id}-${index}`}
                  food={food}
                  canAdd={canAdd}
                  onAdd={() => pickFood(food)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 border-t border-app-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Browse catalog</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setGroupFilter('all')}
            className={clsx(
              'rounded-lg border px-2 py-1 text-[11px] font-semibold transition',
              groupFilter === 'all'
                ? 'border-brand-green bg-brand-green/15 text-brand-deep'
                : 'border-app-border bg-app-bg text-app-text-muted hover:bg-app-muted'
            )}
          >
            All
          </button>
          {FOOD_GROUPS.map((group) => {
            const colors = GROUP_COLORS[group];
            const active = groupFilter === group;
            return (
              <button
                key={group}
                type="button"
                onClick={() => setGroupFilter(group)}
                className="rounded-lg border px-2 py-1 text-[11px] font-semibold transition"
                style={
                  active
                    ? { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }
                    : { backgroundColor: 'transparent', color: colors.text, borderColor: colors.border, opacity: 0.55 }
                }
              >
                {group}
              </button>
            );
          })}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter catalog…"
          className="mt-2 w-full rounded-xl border border-app-border bg-app-bg px-3 py-1.5 text-sm"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {loading && <p className="py-3 text-sm text-app-text-muted">Loading foods…</p>}
        {!loading &&
          filtered.map(({ group, foods }) => {
            const colors = GROUP_COLORS[group];
            const open = groupFilter !== 'all' || openGroups[group];
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
                            onClick={() => void pickFood(food)}
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

/** Shared tab, or a STYLE option id. Null when the set has no style step. */
type StyleWorkspace = 'shared' | string;

function optionMatchesWorkspace(option: AdminOption, workspace: StyleWorkspace | null, isStyleCard: boolean): boolean {
  if (workspace == null) return true;
  if (isStyleCard) return workspace === 'shared' || option.id === workspace;
  if (workspace === 'shared') return !option.visibleWhenOptionId;
  return !option.visibleWhenOptionId || option.visibleWhenOptionId === workspace;
}

function cardVisibleInWorkspace(card: AdminCard, workspace: StyleWorkspace | null): boolean {
  if (workspace == null) return true;
  if (card.role === 'STYLE') return workspace === 'shared';
  if (workspace === 'shared') return !card.visibleWhenOptionId;
  if (card.visibleWhenOptionId && card.visibleWhenOptionId !== workspace) return false;
  if ((card.hiddenForOptionIds ?? []).includes(workspace)) return false;
  return true;
}

function hiddenCardsForWorkspace(cards: AdminCard[], workspace: StyleWorkspace | null): AdminCard[] {
  if (workspace == null || workspace === 'shared') return [];
  return cards.filter(
    (card) =>
      card.role !== 'STYLE' &&
      !card.visibleWhenOptionId &&
      (card.hiddenForOptionIds ?? []).includes(workspace)
  );
}

export function AdminMealCardSetEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [set, setSet] = useState<AdminCardSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState(500);
  const [workspace, setWorkspace] = useState<StyleWorkspace | null>(null);
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

  async function addStyle() {
    const styleStep = set?.cards.find((card) => card.role === 'STYLE');
    if (!styleStep || !id) return;
    const name = window.prompt('New style name?');
    if (!name?.trim()) return;
    setError(null);
    try {
      const created = await api<{ id: string }>(`/api/admin/cards/${styleStep.id}/options`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim().slice(0, 60) })
      });
      const data = await api<AdminCardSet>(`/api/admin/card-sets/${id}`);
      setSet(data);
      setPreviewTarget((current) => (current === 500 ? Math.round(Number(data.referenceCalories)) : current));
      setWorkspace(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add style');
    }
  }

  /** Create a new choosable option on a step, with the food as its portion line. */
  async function addFoodAsOption(
    cardId: string,
    food: Pick<BuilderFood, 'id' | 'name'>,
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
      const message = err instanceof Error ? err.message : 'Could not add option';
      setError(message);
      throw err instanceof Error ? err : new Error(message);
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

  // Bind after the null guard so nested helpers keep a non-null type under tsc -b.
  const cardSet = set;

  const factor =
    previewTarget > 0 && Number(cardSet.referenceCalories) > 0
      ? previewTarget / Number(cardSet.referenceCalories)
      : 1;

  const styleCard = cardSet.cards.find((card) => card.role === 'STYLE');
  const styleOptions = styleCard?.options ?? [];
  const hasStyleWorkspace = styleOptions.length > 0;
  const activeWorkspace: StyleWorkspace | null = !hasStyleWorkspace
    ? null
    : workspace === 'shared' || (workspace != null && styleOptions.some((option) => option.id === workspace))
      ? workspace
      : styleOptions[0]!.id;
  const activeStyle =
    activeWorkspace && activeWorkspace !== 'shared'
      ? styleOptions.find((option) => option.id === activeWorkspace) ?? null
      : null;
  const isStyleWorkspace = activeWorkspace != null && activeWorkspace !== 'shared';
  const gateForNewOptions = isStyleWorkspace ? activeWorkspace : null;

  const visibleCards = cardSet.cards.filter((card) => cardVisibleInWorkspace(card, activeWorkspace));
  const hiddenCards = hiddenCardsForWorkspace(cardSet.cards, activeWorkspace);

  const selectedCard = cardSet.cards.find((card) => card.id === selectedCardId) ?? null;
  const selectedSection =
    selectedCard && selectedCard.role !== 'STYLE' && cardVisibleInWorkspace(selectedCard, activeWorkspace)
      ? selectedCard
      : null;
  const usedFoodIds = new Set(
    (selectedSection?.options ?? [])
      .filter((option) => optionMatchesWorkspace(option, activeWorkspace, false))
      .flatMap((option) => option.foods.map((line) => line.foodId))
  );

  const addStepRoles = (
    ['STYLE', 'PROTEIN', 'CARB', 'VEGETABLE', 'FAT', 'FRUIT', 'FREE'] as const
  ).filter((role) => !isStyleWorkspace || role !== 'STYLE');

  /** Options on earlier steps — used as path gates (Hot / Cold / …). */
  function earlierGateOptions(cardSortOrder: number) {
    return cardSet.cards
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
          <h1 className="text-2xl font-bold">{cardSet.name}</h1>
          <p className="text-sm text-app-text-muted">
            {cardSet.slotType} · reference {Math.round(Number(cardSet.referenceCalories))} kcal · backs{' '}
            {cardSet._count.templateMeals} plan slot(s)
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
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

      {hasStyleWorkspace && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-app-text-muted">Working on</p>
          <div className="flex flex-wrap gap-2">
            {styleOptions.map((option) => {
              const active = activeWorkspace === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setWorkspace(option.id)}
                  className={clsx(
                    'rounded-xl border px-3 py-2 text-sm font-semibold transition',
                    active
                      ? 'border-brand-green bg-brand-green/15 text-brand-deep'
                      : 'border-app-border bg-app-surface text-app-text hover:bg-app-muted'
                  )}
                >
                  {option.icon ? `${option.icon} ` : ''}
                  {option.name}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setWorkspace('shared')}
              className={clsx(
                'rounded-xl border px-3 py-2 text-sm font-semibold transition',
                activeWorkspace === 'shared'
                  ? 'border-brand-green bg-brand-green/15 text-brand-deep'
                  : 'border-app-border bg-app-surface text-app-text hover:bg-app-muted'
              )}
            >
              Shared
            </button>
            <button
              type="button"
              title="Add style"
              onClick={() => void addStyle()}
              className="inline-flex items-center justify-center rounded-xl border border-dashed border-app-border px-2.5 py-2 text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
            >
              <Plus size={16} />
              <span className="sr-only">Add style</span>
            </button>
          </div>
          {isStyleWorkspace && activeStyle && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-green/15 px-3 py-1 text-xs font-semibold text-brand-deep">
                Working on {activeStyle.name}
              </span>
              <span className="text-xs text-app-text-muted">
                New foods from the sidebar attach to this style
              </span>
            </div>
          )}
          {activeWorkspace === 'shared' && (
            <p className="text-sm text-app-text-muted">
              Shared workspace: style names live here, plus options that appear no matter which style the client
              picks. New foods are ungated.
            </p>
          )}
        </div>
      )}

      {cardSet._count.userPicks > 0 && (
        <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
          ⚠️ {cardSet._count.userPicks} client(s) have standing picks in this set — editing portions or removing
          options changes what they get from tomorrow onward. Adding new options is always safe.
        </p>
      )}
      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {visibleCards.map((card, cardIndex) => {
            const isStyleCard = card.role === 'STYLE';
            const sectionSelected = selectedCardId === card.id && !isStyleCard;
            const visibleOptions = card.options.filter((option) =>
              optionMatchesWorkspace(option, activeWorkspace, isStyleCard)
            );
            const hiddenCount = card.options.length - visibleOptions.length;
            const styleOnly = Boolean(card.visibleWhenOptionId);
            const hiddenForNames = (card.hiddenForOptionIds ?? [])
              .map((id) => styleOptions.find((option) => option.id === id)?.name ?? id)
              .filter(Boolean);

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
                  <span className="rounded-full bg-brand-green/15 px-2 py-0.5 text-xs font-bold tabular-nums text-brand-deep">
                    {cardIndex + 1}
                  </span>
                  <select
                    value={card.role}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const role = e.target.value as CardRole;
                      if (role !== card.role) void call(`/api/admin/cards/${card.id}`, 'PATCH', { role });
                    }}
                    title="Step type — what this section is for, not the heading"
                    className="rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-deep hover:border-app-border"
                  >
                    {(['STYLE', 'PROTEIN', 'CARB', 'VEGETABLE', 'FAT', 'FRUIT', 'FREE'] as const).map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <input
                    defaultValue={card.name}
                    onBlur={(e) => e.target.value !== card.name && void call(`/api/admin/cards/${card.id}`, 'PATCH', { name: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-lg border border-transparent bg-transparent px-2 py-1 text-base font-bold hover:border-app-border"
                  />
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
                  {isStyleWorkspace && !isStyleCard && (
                    <div
                      className="flex items-center gap-1 rounded-lg border border-app-border p-0.5 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={clsx(
                          'rounded-md px-2 py-0.5 font-semibold',
                          !styleOnly ? 'bg-brand-green/15 text-brand-deep' : 'text-app-text-muted hover:text-app-text'
                        )}
                        onClick={() => {
                          if (styleOnly) {
                            void call(`/api/admin/cards/${card.id}`, 'PATCH', { visibleWhenOptionId: null });
                          }
                        }}
                      >
                        All styles
                      </button>
                      <button
                        type="button"
                        className={clsx(
                          'rounded-md px-2 py-0.5 font-semibold',
                          styleOnly ? 'bg-brand-green/15 text-brand-deep' : 'text-app-text-muted hover:text-app-text'
                        )}
                        onClick={() => {
                          if (!styleOnly && activeWorkspace) {
                            void call(`/api/admin/cards/${card.id}`, 'PATCH', {
                              visibleWhenOptionId: activeWorkspace,
                              hiddenForOptionIds: []
                            });
                          }
                        }}
                      >
                        This style only
                      </button>
                    </div>
                  )}
                  {isStyleWorkspace && !isStyleCard && !styleOnly && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!activeWorkspace) return;
                        if (selectedCardId === card.id) setSelectedCardId(null);
                        void call(`/api/admin/cards/${card.id}`, 'PATCH', {
                          hiddenForOptionIds: [...new Set([...(card.hiddenForOptionIds ?? []), activeWorkspace])]
                        });
                      }}
                      className="text-xs font-semibold text-app-text-muted hover:text-app-text"
                    >
                      Hide for this style
                    </button>
                  )}
                  {activeWorkspace === 'shared' && !isStyleCard && (
                    <span className="rounded-full bg-app-muted px-2 py-0.5 text-[11px] font-semibold text-app-text-muted">
                      {styleOnly ? 'This style only' : 'All styles'}
                    </span>
                  )}
                  {activeWorkspace === 'shared' && hiddenForNames.length > 0 && (
                    <span className="text-xs text-app-text-muted">Hidden for {hiddenForNames.join(', ')}</span>
                  )}
                  {hasStyleWorkspace && hiddenCount > 0 && (
                    <span className="text-xs text-app-text-muted">
                      {hiddenCount} option{hiddenCount === 1 ? '' : 's'} on other styles
                    </span>
                  )}
                  <button type="button" title="Move up" onClick={(e) => { e.stopPropagation(); void call(`/api/admin/cards/${card.id}/move`, 'POST', { direction: 'up' }); }} className="ml-auto text-app-text-muted hover:text-app-text"><ArrowUp size={16} /></button>
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
                  {!isStyleCard && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCardId(card.id);
                      }}
                      className={clsx(
                        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold',
                        sectionSelected
                          ? 'bg-brand-green/15 text-brand-deep'
                          : 'text-brand-green hover:bg-app-muted'
                      )}
                    >
                      <Pencil size={13} />
                      {sectionSelected ? 'Editing' : 'Edit'}
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {visibleOptions.length === 0 && card.options.length > 0 && (
                    <p className="text-sm text-app-text-muted">
                      {hasStyleWorkspace
                        ? 'No options on this path yet — add one from the food sidebar or below.'
                        : 'No options match this style filter.'}
                    </p>
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
                        {!hasStyleWorkspace && earlierGateOptions(card.sortOrder).length > 0 && (
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
                        <div className="w-56">
                          <FoodSearch
                            compact
                            onSelect={(food) =>
                              void call(`/api/admin/options/${option.id}/foods`, 'POST', {
                                foodId: food.id,
                                baseServings: 1
                              })
                            }
                          />
                        </div>
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
                      if (!name?.trim()) return;
                      void call(`/api/admin/cards/${card.id}/options`, 'POST', {
                        name: name.trim(),
                        ...(gateForNewOptions && !isStyleCard ? { visibleWhenOptionId: gateForNewOptions } : {})
                      });
                    }}
                  >
                    <Plus size={14} className="mr-1 inline" /> Add option
                  </Button>
                </div>
              </Card>
            );
          })}

          {hiddenCards.length > 0 && activeStyle && (
            <Card className="space-y-2">
              <p className="text-sm font-semibold">Hidden for {activeStyle.name}</p>
              <p className="text-xs text-app-text-muted">
                These shared steps stay in the set but clients who pick this style will not see them.
              </p>
              <ul className="space-y-1">
                {hiddenCards.map((card) => (
                  <li key={card.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-app-muted px-3 py-2 text-sm">
                    <span className="font-semibold">
                      {card.role} · {card.name}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-brand-green hover:underline"
                      onClick={() =>
                        void call(`/api/admin/cards/${card.id}`, 'PATCH', {
                          hiddenForOptionIds: (card.hiddenForOptionIds ?? []).filter((id) => id !== activeWorkspace)
                        })
                      }
                    >
                      Unhide
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase text-app-text-muted">New step role</span>
              <select
                value={addStepRoles.includes(newCard.role) ? newCard.role : 'PROTEIN'}
                onChange={(e) => setNewCard({ ...newCard, role: e.target.value as CardRole })}
                className="rounded-xl border border-app-border bg-app-surface px-3 py-2"
              >
                {addStepRoles.map((role) => (
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
                const role = addStepRoles.includes(newCard.role) ? newCard.role : 'PROTEIN';
                void call(`/api/admin/card-sets/${cardSet.id}/cards`, 'POST', {
                  role,
                  name: newCard.name.trim(),
                  ...(isStyleWorkspace && activeWorkspace ? { visibleWhenOptionId: activeWorkspace } : {})
                });
                setNewCard({ role: 'PROTEIN', name: '' });
              }}
              disabled={!newCard.name.trim()}
            >
              <Plus size={14} className="mr-1 inline" /> Add step
            </Button>
            {isStyleWorkspace && activeStyle && (
              <p className="basis-full text-xs text-app-text-muted">
                Adds a step that only appears for {activeStyle.name}.
              </p>
            )}
            {activeWorkspace === 'shared' && (
              <p className="basis-full text-xs text-app-text-muted">
                Adds a step for every style. Hide it later from a style tab if needed.
              </p>
            )}
          </Card>
        </div>

        <FoodMacroSidebar
          catalog={foodCatalog}
          loading={foodsLoading}
          usedFoodIds={usedFoodIds}
          selectedSectionLabel={selectedSection?.name ?? null}
          suggestedGroup={selectedSection ? ROLE_TO_FOOD_GROUP[selectedSection.role] ?? null : null}
          onPick={(food) => {
            if (!selectedSection) return;
            return addFoodAsOption(selectedSection.id, food, gateForNewOptions);
          }}
        />
      </div>
    </div>
  );
}
