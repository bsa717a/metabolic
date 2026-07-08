import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getWeekDates, isToday, startOfWeek, todayKey } from '../services/api';
import type { PlanPeriodInfo } from '../types';
import { MealPlanner } from '../components/nutrition/MealPlanner';
import { WeekDateStrip } from '../components/nutrition/WeekDateStrip';
import { AddFoodsPanel } from '../components/nutrition/weekly/AddFoodsPanel';
import { EditMealPlanDrawer } from '../components/nutrition/EditMealPlanDrawer';
import { AiFoodLookupDrawer } from '../components/nutrition/AiFoodLookupDrawer';
import { MealBuilder, type MealCardsPayload } from '../components/nutrition/MealBuilder';
import { ShoppingListDrawer } from '../components/nutrition/ShoppingListDrawer';
import { NutritionTargetsDrawer } from '../components/nutrition/NutritionTargetsDrawer';
import { PlanActionsMenu } from '../components/nutrition/PlanActionsMenu';
import { DailyMealBuilderModal } from '../components/nutrition/DailyMealBuilderModal';
import { PlanPeriodBanner } from '../components/nutrition/PlanPeriodBanner';
import {
  type DayMeals,
  fetchMealsForDates,
  formatWeekExportLabel,
  getWeekRange,
  weekHasMeals
} from '../utils/planExportData';
import { useEntitlements } from '../context/EntitlementsContext';
import { UpgradePrompt } from '../components/entitlements/UpgradePrompt';
import { printNutritionPlan, printNutritionWeekPlan } from '../utils/printNutritionPlan';

function dateFromParams(params: URLSearchParams) {
  const date = params.get('date');
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayKey();
}

export function NutritionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(() => dateFromParams(searchParams));
  const [weekDays, setWeekDays] = useState<DayMeals[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [logActualMealId, setLogActualMealId] = useState<string>();
  const [aiState, setAiState] = useState<{ mealId: string; itemType: 'PLANNED' | 'ACTUAL' }>();
  const [shoppingListOpen, setShoppingListOpen] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);
  const [mealBuilderOpen, setMealBuilderOpen] = useState(false);
  const [printing, setPrinting] = useState<'day' | 'week' | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [copyingDay, setCopyingDay] = useState(false);
  const [selectedMealId, setSelectedMealId] = useState<string>();
  const [cardMeals, setCardMeals] = useState<MealCardsPayload[]>([]);
  const [builderMealNumber, setBuilderMealNumber] = useState<number | null>(null);
  const [planPeriod, setPlanPeriod] = useState<PlanPeriodInfo | null>(null);
  const [upgradePrompt, setUpgradePrompt] = useState<'meal_planning' | 'personalized_targets' | null>(null);
  const { canAccess } = useEntitlements();

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
    if (searchParams.get('targets') !== '1') return;

    if (canAccess('personalized_targets')) {
      setTargetsOpen(true);
    } else {
      setUpgradePrompt('personalized_targets');
    }

    const next = new URLSearchParams(searchParams);
    next.delete('targets');
    setSearchParams(next, { replace: true });
  }, [searchParams, canAccess, setSearchParams]);

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

  // Card-builder availability for the selected day; 404 = plan has no card sets.
  useEffect(() => {
    let cancelled = false;
    api<MealCardsPayload[]>(`/api/daily-logs/${selectedDate}/meal-cards`)
      .then((payloads) => { if (!cancelled) setCardMeals(payloads); })
      .catch(() => { if (!cancelled) setCardMeals([]); });
    api<PlanPeriodInfo>(`/api/daily-logs/${selectedDate}/plan-period`)
      .then((info) => { if (!cancelled) setPlanPeriod(info); })
      .catch(() => { if (!cancelled) setPlanPeriod(null); });
    return () => { cancelled = true; };
  }, [selectedDate]);

  const reloadPlanPeriod = useCallback(async () => {
    try {
      setPlanPeriod(await api<PlanPeriodInfo>(`/api/daily-logs/${selectedDate}/plan-period`));
    } catch {
      setPlanPeriod(null);
    }
  }, [selectedDate]);

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
    if (copyingDay) return;
    if (!window.confirm("Copy the previous day's plan into this day? Planned foods and meal names will be copied into each meal.")) return;
    setCopyingDay(true);
    try {
      await api(`/api/daily-logs/${selectedDate}/copy-from-previous-day`, { method: 'POST' });
      await reloadWeek();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not copy the previous day.');
    } finally {
      setCopyingDay(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Nutrition</h1>
        <PlanActionsMenu
          onCopyDay={() => void handleCopyDay()}
          copyDayDisabled={false}
          copyingDay={copyingDay}
          onGroceryList={() =>
            canAccess('meal_planning') ? setShoppingListOpen(true) : setUpgradePrompt('meal_planning')
          }
          onAdjustTargets={() =>
            canAccess('personalized_targets') ? setTargetsOpen(true) : setUpgradePrompt('personalized_targets')
          }
          onMealBuilder={() =>
            canAccess('meal_planning') ? setMealBuilderOpen(true) : setUpgradePrompt('meal_planning')
          }
          printing={printing}
          onPrintDay={handlePrintDay}
          onPrintWeek={handlePrintWeek}
        />
      </div>

      {(planPeriod?.weekNumber != null || planPeriod?.calorieTarget != null) && (
        <PlanPeriodBanner planPeriod={planPeriod} />
      )}

      <WeekDateStrip selectedDate={selectedDate} onSelectDate={selectDate} days={weekDays} />

      {printError && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{printError}</div>}
      {loadError && <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadError}</div>}

      {upgradePrompt ? <UpgradePrompt feature={upgradePrompt} /> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-4">
              <MealPlanner
                meals={currentDayMeals}
                selectedDate={selectedDate}
                onChange={() => void reloadWeek()}
                onLogActual={(mealId) => setLogActualMealId(mealId)}
                selectedMealId={effectiveSelectedMealId}
                onSelectMeal={setSelectedMealId}
                cardMeals={cardMeals.map(({ mealNumber, slotType, targetCalories, targetProtein, targetCarbs, targetFat, dailyTargets }) => ({
                  mealNumber,
                  slotType,
                  macroTargets: {
                    calories: targetCalories,
                    protein: targetProtein ?? 0,
                    carbs: targetCarbs ?? 0,
                    fat: targetFat ?? 0
                  },
                  dailyTargets: dailyTargets
                    ? {
                        calories: dailyTargets.calories,
                        protein: dailyTargets.protein,
                        carbs: dailyTargets.carbs,
                        fat: dailyTargets.fat
                      }
                    : null
                }))}
                onBuildMeal={(mealNumber) =>
                  canAccess('meal_planning') ? setBuilderMealNumber(mealNumber) : setUpgradePrompt('meal_planning')
                }
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

      <ShoppingListDrawer open={shoppingListOpen} anchorDate={selectedDate} onClose={() => setShoppingListOpen(false)} />

      <NutritionTargetsDrawer
        open={targetsOpen}
        planDate={selectedDate}
        onClose={() => setTargetsOpen(false)}
        onSaved={async () => {
          await Promise.all([reloadWeek(), reloadPlanPeriod()]);
        }}
      />

      <MealBuilder
        open={builderMealNumber != null}
        date={selectedDate}
        payload={cardMeals.find((p) => p.mealNumber === builderMealNumber) ?? null}
        onClose={() => setBuilderMealNumber(null)}
        onSaved={async (updated) => {
          setCardMeals((prev) => prev.map((p) => (p.mealNumber === updated.mealNumber ? updated : p)));
          await reloadWeek();
        }}
      />

      <DailyMealBuilderModal
        open={mealBuilderOpen}
        date={selectedDate}
        dayMeals={currentDayMeals}
        onClose={() => setMealBuilderOpen(false)}
        onSaved={() => void reloadWeek()}
      />
    </div>
  );
}
