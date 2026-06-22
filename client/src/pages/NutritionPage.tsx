import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LayoutTemplate, ShoppingCart } from 'lucide-react';
import { api, isFuture, isToday, todayKey } from '../services/api';
import { AddExtraFoodButton } from '../components/gamification/AddExtraFoodButton';
import type { Meal, NutritionPlanTemplateSummary } from '../types';
import { MealPlanner } from '../components/nutrition/MealPlanner';
import { WeekDateStrip } from '../components/nutrition/WeekDateStrip';
import { EditMealPlanDrawer } from '../components/nutrition/EditMealPlanDrawer';
import { AiFoodLookupDrawer } from '../components/nutrition/AiFoodLookupDrawer';
import { ApplyTemplateModal } from '../components/nutrition/ApplyTemplateModal';
import { ShoppingListDrawer } from '../components/nutrition/ShoppingListDrawer';
import { PlanPrintMenu } from '../components/export/PlanPrintMenu';
import { Button } from '../components/ui/Button';
import {
  fetchMealsForDates,
  formatWeekExportLabel,
  getWeekRange,
  weekHasMeals
} from '../utils/planExportData';
import { printNutritionPlan, printNutritionWeekPlan } from '../utils/printNutritionPlan';

function dateFromParams(params: URLSearchParams) {
  const date = params.get('date');
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayKey();
}

export function NutritionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(() => dateFromParams(searchParams));
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [logActualMealId, setLogActualMealId] = useState<string>();
  const [aiState, setAiState] = useState<{ mealId: string; itemType: 'PLANNED' | 'ACTUAL' }>();
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [shoppingListOpen, setShoppingListOpen] = useState(false);
  const [printing, setPrinting] = useState<'day' | 'week' | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [defaultTemplate, setDefaultTemplate] = useState<NutritionPlanTemplateSummary | null>(null);

  const load = useCallback(async (date: string) => {
    try {
      const data = await api<Meal[]>(`/api/daily-logs/${date}/ensure`, { method: 'POST' });
      setMeals(data);
      setLoadError(data.length ? null : 'No meals for this day yet.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load meals.';
      try {
        const data = await api<Meal[]>(`/api/daily-logs/${date}/meals`);
        setMeals(data);
        setLoadError(data.length ? null : message);
      } catch {
        setMeals([]);
        setLoadError(message);
      }
    }
  }, []);

  useEffect(() => {
    const date = dateFromParams(searchParams);
    setSelectedDate(date);
  }, [searchParams]);

  useEffect(() => {
    load(selectedDate);
  }, [selectedDate, load]);

  useEffect(() => {
    api<NutritionPlanTemplateSummary | null>('/api/nutrition-templates/default')
      .then(setDefaultTemplate)
      .catch(() => setDefaultTemplate(null));
  }, [selectedDate, meals]);

  function selectDate(date: string) {
    setSelectedDate(date);
    setSearchParams(date === todayKey() ? {} : { date }, { replace: true });
  }

  function openLogActual(mealId: string) {
    setLogActualMealId(mealId);
  }

  function openAiFromDrawer(mealId: string, mode: 'PLANNED' | 'ACTUAL') {
    setLogActualMealId(undefined);
    setAiState({ mealId, itemType: mode });
  }

  const logActualMeal = meals.find((meal) => meal.id === logActualMealId);
  const dayTotals = meals.reduce(
    (sum, meal) => ({
      plannedCalories: sum.plannedCalories + Number(meal.plannedCalories),
      plannedProtein: sum.plannedProtein + Number(meal.plannedProtein),
      plannedCarbs: sum.plannedCarbs + Number(meal.plannedCarbs),
      plannedFat: sum.plannedFat + Number(meal.plannedFat),
      actualCalories: sum.actualCalories + Number(meal.actualCalories),
      actualProtein: sum.actualProtein + Number(meal.actualProtein),
      actualCarbs: sum.actualCarbs + Number(meal.actualCarbs),
      actualFat: sum.actualFat + Number(meal.actualFat)
    }),
    {
      plannedCalories: 0,
      plannedProtein: 0,
      plannedCarbs: 0,
      plannedFat: 0,
      actualCalories: 0,
      actualProtein: 0,
      actualCarbs: 0,
      actualFat: 0
    }
  );

  function formatDayLine(label: string, calories: number, protein: number, carbs: number, fat: number) {
    return `${label}: ${Math.round(calories)} kcal · ${Math.round(protein)}g protein · ${Math.round(carbs)}g carbs · ${Math.round(fat)}g fat`;
  }

  function handlePrintDay() {
    setPrintError(null);
    if (!meals.length) {
      setPrintError('No meals planned for this day.');
      return;
    }
    try {
      printNutritionPlan(meals, selectedDate);
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Could not open print view.');
    }
  }

  async function handlePrintWeek() {
    setPrintError(null);
    setPrinting('week');
    try {
      const week = getWeekRange(selectedDate);
      const days = await fetchMealsForDates(week.dates);
      if (!weekHasMeals(days)) {
        setPrintError('No meals planned for this week.');
        return;
      }
      printNutritionWeekPlan(days, formatWeekExportLabel(week.startDate));
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Could not open print view.');
    } finally {
      setPrinting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Nutrition</h1>
        <p className="text-slate-500">Plan meals and track what you actually ate.</p>
      </div>

      <WeekDateStrip
        selectedDate={selectedDate}
        onSelectDate={selectDate}
        endAction={
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              aria-label="Shopping list"
              title="Shopping list"
              className="inline-flex min-h-[2.5rem] items-center justify-center px-3.5 py-2.5"
              onClick={() => setShoppingListOpen(true)}
            >
              <ShoppingCart className="h-[1.375rem] w-[1.375rem]" />
            </Button>
            <PlanPrintMenu printing={printing} onPrintDay={handlePrintDay} onPrintWeek={handlePrintWeek} />
            <Button type="button" variant="secondary" onClick={() => setTemplateModalOpen(true)}>
              <LayoutTemplate className="mr-1 inline h-4 w-4" />
              Templates
            </Button>
          </div>
        }
      />

      {printError && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{printError}</div>
      )}

      {defaultTemplate && (
        <p className="text-sm text-slate-500">
          Default plan: <span className="font-medium text-slate-700">{defaultTemplate.name}</span>
        </p>
      )}

      {loadError && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadError}</div>
      )}

      {!isFuture(selectedDate) && (
        <AddExtraFoodButton date={selectedDate} onAdded={() => load(selectedDate)} />
      )}

      <MealPlanner
        meals={meals}
        selectedDate={selectedDate}
        onChange={() => load(selectedDate)}
        onLogActual={openLogActual}
      />

      {meals.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="font-semibold text-slate-900">Day totals</p>
          {!isToday(selectedDate) && <p className="text-sm text-slate-400">{selectedDate}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-yellow-50 p-3 text-sm text-slate-700">
              {formatDayLine('Planned', dayTotals.plannedCalories, dayTotals.plannedProtein, dayTotals.plannedCarbs, dayTotals.plannedFat)}
            </div>
            <div className="rounded-2xl bg-blue-50 p-3 text-sm text-slate-700">
              {formatDayLine('Actual', dayTotals.actualCalories, dayTotals.actualProtein, dayTotals.actualCarbs, dayTotals.actualFat)}
            </div>
          </div>
        </div>
      )}

      <EditMealPlanDrawer
        open={Boolean(logActualMealId)}
        meal={logActualMeal}
        mode="ACTUAL"
        onClose={() => setLogActualMealId(undefined)}
        onSaved={() => load(selectedDate)}
        onAskAi={openAiFromDrawer}
      />

      <AiFoodLookupDrawer
        open={Boolean(aiState)}
        mealId={aiState?.mealId}
        itemType={aiState?.itemType ?? 'ACTUAL'}
        onClose={() => setAiState(undefined)}
        onSaved={() => load(selectedDate)}
      />

      <ApplyTemplateModal
        open={templateModalOpen}
        selectedDate={selectedDate}
        meals={meals}
        onClose={() => setTemplateModalOpen(false)}
        onApplied={() => load(selectedDate)}
      />

      <ShoppingListDrawer open={shoppingListOpen} anchorDate={selectedDate} onClose={() => setShoppingListOpen(false)} />
    </div>
  );
}
