import { useMemo, useRef, useState } from 'react';
import { Camera, ChevronDown, Leaf, Plus, X } from 'lucide-react';
import type { Meal, MealItem } from '../../types';
import { api, todayDateParam } from '../../services/api';
import { isWaterLogRequest } from '../../utils/waterLog';
import { parseFoodEntry } from '../../utils/foodEntryParse';
import { PlannedItemChecklist } from '../nutrition/PlannedItemChecklist';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Drawer } from '../ui/Drawer';

type LookupResult = {
  items: Array<{
    source: 'existing' | 'ai';
    food?: {
      id: string;
      name: string;
      servingUnit: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
    lookup?: { id: string };
    estimate?: Pick<MealItem, 'calories' | 'protein' | 'carbs' | 'fat'> & { normalizedFoodName: string };
  }>;
};

type MealSuggestion = {
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const FREE_FOOD_TRIGGERS = new Set(['free', 'free food', 'free foods']);
const MEAL_SUGGESTION_QUESTION_PATTERN =
  /\b(what (?:can|should) i (?:eat|order|get)|what do you suggest|what would you suggest|help me (?:choose|pick|order)|(?:any )?suggestions? for|recommend(?:ations)? for)\b/i;
const MEAL_SUGGESTION_AT_VENUE_PATTERN = /\b(i'm|im) at\b.+\b(what|suggest|recommend)\b/i;

const FREE_FOOD_SECTIONS = [
  {
    title: 'Vegetables and add-ons',
    items: [
      'Green vegetables',
      'Onions',
      'Garlic',
      'Celery',
      'Cucumbers',
      'Cauliflower',
      'Bell peppers',
      'Pickles',
      'Pepperoncini',
      'Salsa',
      'Mushrooms',
      'Sprouts',
      'Water chestnuts',
      'Tomatoes',
      'Kimchi'
    ]
  },
  {
    title: 'Seasonings',
    items: [
      'Chili powder',
      'Cinnamon',
      'Season-all',
      'Mrs. Dash',
      'Cumin',
      'Hot sauce',
      'Mustard',
      'Ranch powder',
      'Cooking spray',
      "I Can't Believe It's Not Butter spray",
      'Butter Buds',
      'Molly McButter'
    ]
  },
  {
    title: 'Dressings and sauces',
    items: [
      'Lemon or lime juice',
      'Red wine vinegar',
      'Salad spritzers',
      'Walden Farms-style dressing',
      'Low-sodium soy sauce',
      'Low-sodium chicken broth',
      'Taco sauce',
      'Enchilada sauce',
      'Low-sugar buffalo sauce',
      'Sugar-free ketchup',
      'Sugar-free teriyaki',
      'Sugar-free BBQ sauce'
    ]
  },
  {
    title: 'Drinks and sweets',
    items: [
      'Black coffee',
      'Green tea',
      'Sugar-free drinks',
      'Dairy-free sugar-free creamer',
      'Stevia',
      'Truvia',
      'Sugar-free gum',
      'Sugar-free gelatin'
    ]
  }
];

function isFreeFoodRequest(input: string) {
  return FREE_FOOD_TRIGGERS.has(input.trim().toLowerCase());
}

function isMealSuggestionRequest(input: string) {
  const text = input.trim();
  if (!text) return false;
  if (text.endsWith('?')) return true;
  if (/^(what|how|can you|could you|help me|i need|looking for)\b/i.test(text)) return true;
  return MEAL_SUGGESTION_QUESTION_PATTERN.test(text) || MEAL_SUGGESTION_AT_VENUE_PATTERN.test(text);
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.includes(',') ? result.split(',')[1] ?? '' : result);
    };
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

function formatPlannedTime(plannedTime?: string | null) {
  if (!plannedTime) return null;
  const match = plannedTime.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return plannedTime;

  const [, hour, minute] = match;
  return new Date(2000, 0, 1, Number(hour), Number(minute))
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(' AM', 'am')
    .replace(' PM', 'pm');
}

export function TodayNutrition({
  meals,
  onChange
}: {
  meals: Meal[];
  onChange: () => void | Promise<void>;
}) {
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);
  const [entry, setEntry] = useState('');
  const [photo, setPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freeFoodsOpen, setFreeFoodsOpen] = useState(false);
  const [selectedFreeMealId, setSelectedFreeMealId] = useState<string | null>(null);
  const [freeFoodError, setFreeFoodError] = useState<string | null>(null);
  const [freeFoodSaving, setFreeFoodSaving] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [selectedSuggestionMealId, setSelectedSuggestionMealId] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [suggestionSaving, setSuggestionSaving] = useState<string | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionPrompt, setSuggestionPrompt] = useState('');
  const [suggestionIntro, setSuggestionIntro] = useState('');

  // The meal this entry will log to (parsed from a "meal 5"/"for lunch"/"at 6pm" directive, or the
  // expanded/next-meal fallback) — surfaced under the box so the user sees the target before adding.
  const detectedMeal = useMemo(() => {
    if (!entry.trim() || isWaterLogRequest(entry)) return undefined;
    return parseFoodEntry(meals, entry, expandedMealId).targetMeal;
  }, [entry, meals, expandedMealId]);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function toggleMeal(mealId: string) {
    setExpandedMealId((current) => (current === mealId ? null : mealId));
  }

  function clearPhoto() {
    setPhoto((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  }

  function selectPhoto(file: File) {
    setError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Use a JPG, PNG, or WEBP image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be 10 MB or smaller.');
      return;
    }
    setPhoto((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
  }

  function openFreeFoods() {
    setError(null);
    setFreeFoodError(null);
    setSelectedFreeMealId(expandedMealId);
    setFreeFoodsOpen(true);
  }

  async function addFreeFood(foodName: string) {
    const targetMealId = expandedMealId ?? selectedFreeMealId;
    if (!targetMealId) {
      setFreeFoodError('Select a meal first, then tap a food to log it.');
      return;
    }

    setFreeFoodSaving(foodName);
    setFreeFoodError(null);
    try {
      await api(`/api/meals/${targetMealId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'ACTUAL',
          nameSnapshot: foodName,
          quantity: 1,
          unit: 'serving',
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0
        })
      });
      setExpandedMealId(targetMealId);
      await onChange();
    } catch (err) {
      setFreeFoodError(err instanceof Error ? err.message : 'Could not log that free food.');
    } finally {
      setFreeFoodSaving(null);
    }
  }

  async function loadMealSuggestions(inputText: string) {
    setSuggestionPrompt(inputText);
    setSelectedSuggestionMealId(expandedMealId);
    setSuggestionError(null);
    setSuggestions([]);
    setSuggestionIntro('');
    setSuggestionsOpen(true);
    setSuggestionLoading(true);
    try {
      const result = await api<{ intro: string; options: MealSuggestion[] }>('/api/ai/meal-suggestions', {
        method: 'POST',
        body: JSON.stringify({ inputText })
      });
      setSuggestionIntro(result.intro);
      setSuggestions(result.options);
    } catch (err) {
      setSuggestionError(err instanceof Error ? err.message : 'Could not get meal suggestions.');
    } finally {
      setSuggestionLoading(false);
    }
  }

  async function addMealSuggestion(option: MealSuggestion) {
    const targetMealId = expandedMealId ?? selectedSuggestionMealId;
    if (!targetMealId) {
      setSuggestionError('Select a meal first, then tap an option to log it.');
      return;
    }

    setSuggestionSaving(option.name);
    setSuggestionError(null);
    try {
      await api(`/api/meals/${targetMealId}/items`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'ACTUAL',
          nameSnapshot: option.name,
          quantity: 1,
          unit: 'meal',
          calories: option.calories,
          protein: option.protein,
          carbs: option.carbs,
          fat: option.fat
        })
      });
      setEntry('');
      setExpandedMealId(targetMealId);
      await onChange();
      try {
        await api(`/api/gamification/meals/${targetMealId}/log`, {
          method: 'POST',
          body: JSON.stringify({
            status: 'ATE_SOMETHING_DIFFERENT',
            actualFoodDescription: option.name
          })
        });
      } catch {
        // Meal was logged; gamification is best-effort.
      }
    } catch (err) {
      setSuggestionError(err instanceof Error ? err.message : 'Could not log that meal option.');
    } finally {
      setSuggestionSaving(null);
    }
  }

  async function addFood() {
    const input = entry.trim();
    if (!input && !photo) return;
    if (!photo && isFreeFoodRequest(input)) {
      openFreeFoods();
      return;
    }
    if (!photo && isMealSuggestionRequest(input)) {
      await loadMealSuggestions(input);
      return;
    }
    if (!photo && isWaterLogRequest(input)) {
      setSaving(true);
      setError(null);
      try {
        await api(`/api/hydration/log?${todayDateParam()}`, {
          method: 'POST',
          body: JSON.stringify({ text: input, source: 'AI' })
        });
        setEntry('');
        window.dispatchEvent(new Event('hydration-updated'));
        onChange();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not log water');
      } finally {
        setSaving(false);
      }
      return;
    }

    const { targetMeal, foodText } = parseFoodEntry(meals, input, expandedMealId);
    if (!targetMeal) {
      setError('No meal is available for today.');
      return;
    }
    if (!foodText && !photo) {
      setError('Add the food on the line after the meal name.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const lookup = photo
        ? await api<LookupResult>('/api/ai/food-lookup/photo', {
            method: 'POST',
            body: JSON.stringify({
              imageBase64: await fileToBase64(photo.file),
              mimeType: photo.file.type,
              inputText: foodText
            })
          })
        : await api<LookupResult>('/api/ai/food-lookup', {
            method: 'POST',
            body: JSON.stringify({ inputText: foodText })
          });

      const lookupIds = lookup.items
        .filter((item) => item.source === 'ai' && item.lookup?.id && item.estimate)
        .map((item) => item.lookup!.id);
      if (lookupIds.length) {
        await api('/api/ai/food-lookup/accept-batch', {
          method: 'POST',
          body: JSON.stringify({ lookupIds, mealId: targetMeal.id, type: 'ACTUAL' })
        });
      }

      await Promise.all(
        lookup.items
          .filter((item) => item.source === 'existing' && item.food)
          .map((item) =>
            api(`/api/meals/${targetMeal.id}/items`, {
              method: 'POST',
              body: JSON.stringify({
                foodId: item.food!.id,
                type: 'ACTUAL',
                nameSnapshot: item.food!.name,
                quantity: 1,
                unit: item.food!.servingUnit,
                calories: Number(item.food!.calories),
                protein: Number(item.food!.protein),
                carbs: Number(item.food!.carbs),
                fat: Number(item.food!.fat)
              })
            })
          )
      );

      if (!lookup.items.length) throw new Error('Could not estimate nutrition for that food.');
      await api(`/api/gamification/meals/${targetMeal.id}/log`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'ATE_SOMETHING_DIFFERENT',
          actualFoodDescription: foodText || 'Dashboard quick add'
        })
      });
      setEntry('');
      clearPhoto();
      setExpandedMealId(targetMeal.id);
      await onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add food.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-brand-navy dark:text-brand-off-white">Today&apos;s Nutrition</h2>
      <div className="space-y-3">
        {meals.map((meal) => {
          const expanded = expandedMealId === meal.id;
          const plannedCount = (meal.items ?? []).filter((item) => item.type === 'PLANNED').length;
          const plannedTime = formatPlannedTime(meal.plannedTime);

          return (
            <div key={meal.id} className="overflow-hidden rounded-2xl bg-app-muted">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-3 text-left"
                onClick={() => toggleMeal(meal.id)}
                aria-expanded={expanded}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-app-text">
                    {meal.mealNumber}. {plannedTime ? `${meal.name} - ${plannedTime}` : meal.name}
                  </p>
                  <p className="text-sm text-app-text-muted">
                    {Math.round(Number(meal.actualCalories))} / {Math.round(Number(meal.plannedCalories))} kcal
                    {plannedCount > 0 && ` · ${plannedCount} item${plannedCount === 1 ? '' : 's'}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={meal.status.includes('EATEN') ? 'green' : 'slate'}>
                    {meal.status.replaceAll('_', ' ')}
                  </Badge>
                  <ChevronDown
                    size={18}
                    className={`text-app-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>
              {expanded && <PlannedItemChecklist meal={meal} onChange={onChange} />}
            </div>
          );
        })}
      </div>
      <div className="mt-4 border-t border-app-border pt-4">
        <p className="mb-2 text-sm font-medium text-app-text">Add food directly or ask about restaurant choices</p>
        <div className="flex gap-2">
          <textarea
            className="min-h-24 flex-1 rounded-xl border border-app-border bg-app-bg p-3 text-sm"
            placeholder="Type what you ate, log water (e.g. 16 oz water), or mention a meal like lunch."
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
          />
          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              className="grid h-12 w-12 place-items-center rounded-xl border border-app-border bg-app-muted text-app-text-muted transition hover:border-brand-green/40 hover:text-app-text disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Upload food photo"
              title="Upload food photo"
              disabled={saving}
              onClick={() => photoInputRef.current?.click()}
            >
              <Camera size={20} />
            </button>
            <button
              type="button"
              className="flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-brand-green/30 bg-brand-green/10 text-[10px] font-semibold uppercase tracking-wide text-brand-green transition hover:border-brand-green/60 hover:bg-brand-green/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-green-light"
              aria-label="Show free foods"
              title="Show free foods"
              disabled={saving}
              onClick={openFreeFoods}
            >
              <Leaf size={16} />
              Free
            </button>
            <button
              type="button"
              className="grid h-12 w-12 place-items-center rounded-xl bg-brand-navy text-brand-off-white shadow-sm transition hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-green dark:text-brand-navy dark:hover:bg-brand-green-light"
              aria-label="Add food"
              title="Add food"
              disabled={saving || (!entry.trim() && !photo)}
              onClick={() => void addFood()}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
        {detectedMeal && (
          <p className="mt-2 text-xs text-app-text-muted">
            Logging to <span className="font-medium text-app-text">{detectedMeal.name}</span>
          </p>
        )}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={saving}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) selectPhoto(file);
            event.target.value = '';
          }}
        />
        {photo && (
          <div className="relative mt-3 overflow-hidden rounded-xl border border-app-border">
            <img src={photo.previewUrl} alt="Food preview" className="h-36 w-full object-cover" />
            <button
              type="button"
              className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white"
              aria-label="Remove food photo"
              disabled={saving}
              onClick={clearPhoto}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        {saving && <p className="mt-2 text-sm text-app-text-muted">Adding food…</p>}
      </div>
      <Drawer open={freeFoodsOpen} title="Free foods" onClose={() => setFreeFoodsOpen(false)}>
        <div className="space-y-5">
          <p className="text-sm text-app-text-muted">
            Tap a food to log it as a zero-macro add-on. If a meal is expanded, it will be added there automatically.
          </p>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-text-muted">Log to meal</p>
            <div className="flex flex-wrap gap-2">
              {meals.map((meal) => {
                const active = (expandedMealId ?? selectedFreeMealId) === meal.id;
                return (
                  <button
                    key={meal.id}
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? 'bg-brand-green text-brand-navy'
                        : 'border border-app-border bg-app-surface text-app-text-muted hover:border-brand-green/50 hover:text-app-text'
                    }`}
                    onClick={() => {
                      setSelectedFreeMealId(meal.id);
                      setFreeFoodError(null);
                    }}
                  >
                    {meal.mealNumber}. {meal.name}
                  </button>
                );
              })}
            </div>
            {!expandedMealId && !selectedFreeMealId && (
              <p className="mt-2 text-sm text-brand-gold">Select a meal, then tap a free food to log it.</p>
            )}
          </div>
          {freeFoodError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{freeFoodError}</p>}
          {FREE_FOOD_SECTIONS.map((section) => (
            <section key={section.title} className="rounded-2xl border border-app-border bg-app-muted/50 p-4">
              <h3 className="font-semibold text-app-text">{section.title}</h3>
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {section.items.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-left text-app-text transition hover:border-brand-green/50 hover:bg-brand-green/10 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={Boolean(freeFoodSaving)}
                      onClick={() => void addFreeFood(item)}
                    >
                      <span>{item}</span>
                      <Plus size={14} className="shrink-0 text-brand-green" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="rounded-2xl bg-brand-gold/10 p-4 text-sm text-app-text-muted">
            "Free" means friendly to most plans in normal servings. Packaged sauces, dressings, drinks, and sweeteners can still
            add sodium, calories, or sugar alcohols, so check labels when portions get larger.
          </p>
          {freeFoodSaving && <p className="text-sm text-app-text-muted">Logging {freeFoodSaving}...</p>}
        </div>
      </Drawer>
      <Drawer open={suggestionsOpen} title="Meal suggestions" onClose={() => setSuggestionsOpen(false)}>
        <div className="space-y-5">
          <p className="text-sm text-app-text-muted">
            Select the meal, then tap the option you want to log. Estimates are approximate and based on your current targets.
          </p>
          {suggestionPrompt && (
            <p className="rounded-2xl bg-app-muted p-3 text-sm font-medium text-app-text">{suggestionPrompt}</p>
          )}
          {suggestionIntro && (
            <p className="rounded-2xl border border-brand-green/20 bg-brand-green/10 p-4 text-sm text-app-text">
              {suggestionIntro}
            </p>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-text-muted">Log to meal</p>
            <div className="flex flex-wrap gap-2">
              {meals.map((meal) => {
                const active = (expandedMealId ?? selectedSuggestionMealId) === meal.id;
                return (
                  <button
                    key={meal.id}
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? 'bg-brand-green text-brand-navy'
                        : 'border border-app-border bg-app-surface text-app-text-muted hover:border-brand-green/50 hover:text-app-text'
                    }`}
                    onClick={() => {
                      setSelectedSuggestionMealId(meal.id);
                      setSuggestionError(null);
                    }}
                  >
                    {meal.mealNumber}. {meal.name}
                  </button>
                );
              })}
            </div>
            {!expandedMealId && !selectedSuggestionMealId && (
              <p className="mt-2 text-sm text-brand-gold">Select a meal, then tap an option to log it.</p>
            )}
          </div>
          {suggestionLoading && <p className="text-sm text-app-text-muted">Looking up options...</p>}
          {suggestionError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{suggestionError}</p>}
          <div className="space-y-3">
            {suggestions.map((option) => (
              <button
                key={`${option.name}-${option.calories}`}
                type="button"
                className="w-full rounded-2xl border border-app-border bg-app-surface p-4 text-left transition hover:border-brand-green/50 hover:bg-brand-green/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={Boolean(suggestionSaving)}
                onClick={() => void addMealSuggestion(option)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-app-text">{option.name}</p>
                    <p className="mt-1 text-sm text-app-text-muted">{option.description}</p>
                  </div>
                  <Plus size={18} className="mt-1 shrink-0 text-brand-green" />
                </div>
                <p className="mt-3 text-sm font-medium text-app-text-muted">
                  {Math.round(option.calories)} kcal · {Math.round(option.protein)}g P · {Math.round(option.carbs)}g C ·{' '}
                  {Math.round(option.fat)}g F
                </p>
              </button>
            ))}
          </div>
          {suggestionSaving && <p className="text-sm text-app-text-muted">Logging {suggestionSaving}...</p>}
        </div>
      </Drawer>
    </Card>
  );
}
