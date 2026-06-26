import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CopyPlus, LayoutTemplate, ShoppingCart } from 'lucide-react';
import { clsx } from 'clsx';
import { api, getWeekDates, isFuture, isToday, startOfWeek, todayKey } from '../services/api';
import type { NutritionPlanTemplateSummary } from '../types';
import { MealPlanner } from '../components/nutrition/MealPlanner';
import { WeekDateStrip } from '../components/nutrition/WeekDateStrip';
import { WeeklyPlanner } from '../components/nutrition/weekly/WeeklyPlanner';
import { AddFoodsPanel } from '../components/nutrition/weekly/AddFoodsPanel';
import { EditMealPlanDrawer } from '../components/nutrition/EditMealPlanDrawer';
import { AiFoodLookupDrawer } from '../components/nutrition/AiFoodLookupDrawer';
import { ApplyTemplateModal } from '../components/nutrition/ApplyTemplateModal';
import { ShoppingListDrawer } from '../components/nutrition/ShoppingListDrawer';
import { PlanPrintMenu } from '../components/export/PlanPrintMenu';
import { Button } from '../components/ui/Button';
import {
  type DayMeals,
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

type View = 'week' | 'day';

export function NutritionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(() => dateFromParams(searchParams));
  const [view, setView] = useState<View>('week');
  const [weekDays, setWeekDays] = useState<DayMeals[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [logActualMealId, setLogActualMealId] = useState<string>();
  const [aiState, setAiState] = useState<{ mealId: string; itemType: 'PLANNED' | 'ACTUAL' }>();
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [shoppingListOpen, setShoppingListOpen] = useState(false);
  const [printing, setPrinting] = useState<'day' | 'week' | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [copyingDay, setCopyingDay] = useState(false);
  const [defaultTemplate, setDefaultTemplate] = useState<NutritionPlanTemplateSummary | null>(null);
  const [selectedMealId, setSelectedMealId] = useState<string>();

  const weekStart = startOfWeek(selectedDate);
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart]);

  const reloadWeek = useCallback(async () => {
    try {
      const data = await fetchMealsForDates(weekDates);
      setWeekDays(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load meals.');
    }
  }, [weekDates]);

  useEffect(() => {
    const date = dateFromParams(searchParams);
    setSelectedDate(date);
  }, [searchParams]);

  useEffect(() => {
    void reloadWeek();
  }, [reloadWeek]);

  const currentDayMeals = useMemo(
    () => weekDays.find((day) => day.date === selectedDate)?.meals ?? [],
    [weekDays, selectedDate]
  );

  const effectiveSelectedMealId =
    selectedMealId && currentDayMeals.some((meal) => meal.id === selectedMealId)
      ? selectedMealId
      : currentDayMeals[0]?.id;
  const daySelectedMeal = currentDayMeals.find((meal) => meal.id === effectiveSelectedMealId);

  useEffect(() => {
    api<NutritionPlanTemplateSummary | null>('/api/nutrition-templates/default')
      .then(setDefaultTemplate)
      .catch(() => setDefaultTemplate(null));
  }, [selectedDate, weekDays]);

  function selectDate(date: string) {
    setSelectedDate(date);
    setSearchParams(date === todayKey() ? {} : { date }, { replace: true });
  }

  function openAiFromDrawer(mealId: string, mode: 'PLANNED' | 'ACTUAL') {
    setLogActualMealId(undefined);
    setAiState({ mealId, itemType: mode });
  }

  const allMeals = useMemo(() => weekDays.flatMap((day) => day.meals), [weekDays]);
  const logActualMeal = allMeals.find((meal) => meal.id === logActualMealId);

  const dayTotals = currentDayMeals.reduce(
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
    if (!currentDayMeals.length) {
      setPrintError('No meals planned for this day.');
      return;
    }
    try {
      printNutritionPlan(currentDayMeals, selectedDate);
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

  async function handleCopyDay() {
    if (!currentDayMeals.length || copyingDay) return;
    if (!window.confirm("Copy the previous day's plan into this day? Planned foods will be added to each meal.")) return;
    setCopyingDay(true);
    try {
      await Promise.all(
        currentDayMeals.map((meal) => api(`/api/meals/${meal.id}/copy-from-previous-day`, { method: 'POST' }))
      );
      await reloadWeek();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not copy the previous day.');
    } finally {
      setCopyingDay(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Nutrition</h1>
          <p className="text-app-text-muted">Plan your week and track what you actually ate.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleCopyDay()}
            disabled={copyingDay || !currentDayMeals.length}
          >
            <CopyPlus className="mr-1 inline h-4 w-4" />
            Copy day
          </Button>
          <Button
            type="button"
            variant="secondary"
            aria-label="Shopping list"
            title="Grocery list"
            onClick={() => setShoppingListOpen(true)}
          >
            <ShoppingCart className="mr-1 inline h-4 w-4" />
            Grocery list
          </Button>
          <PlanPrintMenu printing={printing} onPrintDay={handlePrintDay} onPrintWeek={handlePrintWeek} />
          <Button type="button" variant="secondary" onClick={() => setTemplateModalOpen(true)}>
            <LayoutTemplate className="mr-1 inline h-4 w-4" />
            Templates
          </Button>
        </div>
      </div>

      <WeekDateStrip
        selectedDate={selectedDate}
        onSelectDate={selectDate}
        endAction={
          <div className="inline-flex rounded-xl bg-app-muted p-1">
            {(['week', 'day'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={clsx(
                  'rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition',
                  view === option ? 'bg-app-surface text-app-text shadow-sm' : 'text-app-text-muted hover:text-app-text'
                )}
              >
                {option}
              </button>
            ))}
          </div>
        }
      />

      {defaultTemplate && (
        <p className="text-sm text-app-text-muted">
          Default plan: <span className="font-medium text-app-text">{defaultTemplate.name}</span>
        </p>
      )}

      {printError && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{printError}</div>}
      {loadError && <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadError}</div>}

      {view === 'week' ? (
        <WeeklyPlanner
          weekDates={weekDates}
          days={weekDays}
          onSelectDay={selectDate}
          onChange={reloadWeek}
          onLogActual={(mealId) => setLogActualMealId(mealId)}
          onAskAi={(mealId) => openAiFromDrawer(mealId, isFuture(selectedDate) ? 'PLANNED' : 'ACTUAL')}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-4">
              <MealPlanner
                meals={currentDayMeals}
                selectedDate={selectedDate}
                onChange={() => void reloadWeek()}
                onLogActual={(mealId) => setLogActualMealId(mealId)}
                selectedMealId={effectiveSelectedMealId}
                onSelectMeal={setSelectedMealId}
              />

              {currentDayMeals.length > 0 && (
                <div className="rounded-2xl border border-app-border bg-app-surface p-4">
                  <p className="font-semibold text-app-text">Day totals</p>
                  {!isToday(selectedDate) && <p className="text-sm text-app-text-muted">{selectedDate}</p>}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-brand-gold/10 p-3 text-sm text-app-text ring-1 ring-brand-gold/20">
                      {formatDayLine('Planned', dayTotals.plannedCalories, dayTotals.plannedProtein, dayTotals.plannedCarbs, dayTotals.plannedFat)}
                    </div>
                    <div className="rounded-2xl bg-brand-green/10 p-3 text-sm text-app-text ring-1 ring-brand-green/20">
                      {formatDayLine('Actual', dayTotals.actualCalories, dayTotals.actualProtein, dayTotals.actualCarbs, dayTotals.actualFat)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <AddFoodsPanel
                selectedMeal={daySelectedMeal}
                selectedLabel={daySelectedMeal?.name}
                itemType="ACTUAL"
                onChange={() => void reloadWeek()}
              />
            </div>
          </div>
      )}

      <EditMealPlanDrawer
        open={Boolean(logActualMealId)}
        meal={logActualMeal}
        mode="ACTUAL"
        onClose={() => setLogActualMealId(undefined)}
        onSaved={() => void reloadWeek()}
        onAskAi={openAiFromDrawer}
      />

      <AiFoodLookupDrawer
        open={Boolean(aiState)}
        mealId={aiState?.mealId}
        itemType={aiState?.itemType ?? 'ACTUAL'}
        onClose={() => setAiState(undefined)}
        onSaved={() => void reloadWeek()}
      />

      <ApplyTemplateModal
        open={templateModalOpen}
        selectedDate={selectedDate}
        meals={currentDayMeals}
        onClose={() => setTemplateModalOpen(false)}
        onApplied={() => void reloadWeek()}
      />

      <ShoppingListDrawer open={shoppingListOpen} anchorDate={selectedDate} onClose={() => setShoppingListOpen(false)} />
    </div>
  );
}
