import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Meal } from '../../types';
import { MealCard } from './MealCard';
import { MealSuggestionsDrawer } from './MealSuggestionsDrawer';
import { MealSwapDrawer } from './MealSwapDrawer';
import type {
  MealCardEditorHandle,
  MealCardEditorSaveAllOptions,
  MealMacroTargets
} from './MealCardEditor';
import type { MacroTotals } from './MacroSummaryFooter';

export type CardMealInfo = {
  mealNumber: number;
  slotType: 'BREAKFAST' | 'SNACK' | 'LUNCH' | 'DINNER';
  macroTargets: MealMacroTargets;
  dailyTargets: MealMacroTargets | null;
};

export type MealPlannerHandle = {
  isEditing: () => boolean;
  isDirty: () => boolean;
  saveAll: (options?: MealCardEditorSaveAllOptions) => Promise<boolean>;
  cancelAll: () => boolean;
};

export const MealPlanner = forwardRef<
  MealPlannerHandle,
  {
    meals: Meal[];
    selectedDate: string;
    onChange: () => void;
    onLogActual: (mealId: string) => void;
    selectedMealId?: string;
    onSelectMeal?: (mealId: string) => void;
    cardMeals?: CardMealInfo[];
    onBuildMeal?: (mealNumber: number) => void;
    multiMealEdit?: boolean;
    onEditingChange?: (editing: boolean) => void;
    onDraftPlannedTotalsChange?: (totals: MacroTotals) => void;
  }
>(function MealPlanner(
  {
    meals,
    selectedDate,
    onChange,
    onLogActual,
    selectedMealId,
    onSelectMeal,
    cardMeals = [],
    onBuildMeal,
    multiMealEdit = false,
    onEditingChange,
    onDraftPlannedTotalsChange
  },
  ref
) {
  const [editingMealId, setEditingMealId] = useState<string | undefined>();
  const [editingAll, setEditingAll] = useState(false);
  const [swapMeal, setSwapMeal] = useState<Meal | null>(null);
  const [suggestionsMeal, setSuggestionsMeal] = useState<Meal | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [saveAllError, setSaveAllError] = useState<string | null>(null);
  const [draftTotalsByMeal, setDraftTotalsByMeal] = useState<Record<string, MacroTotals>>({});
  const editorRefs = useRef(new Map<string, MealCardEditorHandle>());

  const isEditing = multiMealEdit ? editingAll : Boolean(editingMealId);

  useEffect(() => {
    setEditingMealId(undefined);
    setEditingAll(false);
    setSwapMeal(null);
    setSuggestionsMeal(null);
    setSaveAllError(null);
    setDraftTotalsByMeal({});
    editorRefs.current.clear();
  }, [selectedDate]);

  useEffect(() => {
    onEditingChange?.(isEditing);
  }, [isEditing, onEditingChange]);

  useEffect(() => {
    if (!isEditing) {
      setDraftTotalsByMeal({});
      return;
    }
    if (!onDraftPlannedTotalsChange) return;

    const aggregated = meals.reduce(
      (sum, meal) => {
        const draft = draftTotalsByMeal[meal.id];
        if (draft) {
          return {
            calories: sum.calories + draft.calories,
            protein: sum.protein + draft.protein,
            carbs: sum.carbs + draft.carbs,
            fat: sum.fat + draft.fat
          };
        }
        return {
          calories: sum.calories + Number(meal.plannedCalories),
          protein: sum.protein + Number(meal.plannedProtein),
          carbs: sum.carbs + Number(meal.plannedCarbs),
          fat: sum.fat + Number(meal.plannedFat)
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    onDraftPlannedTotalsChange(aggregated);
  }, [draftTotalsByMeal, isEditing, meals, onDraftPlannedTotalsChange]);

  const handleDraftTotalsChange = useCallback((mealId: string, totals: MacroTotals) => {
    setDraftTotalsByMeal((prev) => ({ ...prev, [mealId]: totals }));
  }, []);

  const setEditorRef = useCallback((mealId: string, handle: MealCardEditorHandle | null) => {
    if (handle) editorRefs.current.set(mealId, handle);
    else editorRefs.current.delete(mealId);
  }, []);

  function handleEnterEditMode(mealId: string) {
    if (multiMealEdit) {
      setEditingAll(true);
      setSaveAllError(null);
      return;
    }
    if (editingMealId && editingMealId !== mealId) {
      if (!window.confirm('You are currently editing another meal. Discard your changes?')) return;
    }
    setEditingMealId(mealId);
  }

  function handleExitEditMode() {
    if (multiMealEdit) {
      setEditingAll(false);
      setSaveAllError(null);
      return;
    }
    setEditingMealId(undefined);
  }

  function anyDirty() {
    for (const handle of editorRefs.current.values()) {
      if (handle.isDirty()) return true;
    }
    return false;
  }

  async function saveAll(options?: MealCardEditorSaveAllOptions): Promise<boolean> {
    if (!multiMealEdit) return false;
    setSavingAll(true);
    setSaveAllError(null);
    let savedAny = false;
    try {
      const handles = meals
        .map((meal) => editorRefs.current.get(meal.id))
        .filter((handle): handle is MealCardEditorHandle => Boolean(handle));

      for (const handle of handles) {
        if (!handle.isDirty()) continue;
        const ok = await handle.save();
        if (!ok) {
          setSaveAllError('Could not save all meals. Fix the highlighted meal and try again.');
          // Sync editors to server so Cancel cannot show pre-save drafts for meals already written.
          if (savedAny) onChange();
          return false;
        }
        savedAny = true;
      }

      setEditingAll(false);
      onChange();
      if (options?.thenRebalanceMealId) {
        const meal = meals.find((item) => item.id === options.thenRebalanceMealId);
        if (meal) setSuggestionsMeal(meal);
      }
      return true;
    } finally {
      setSavingAll(false);
    }
  }

  function cancelAll(): boolean {
    if (!multiMealEdit) {
      handleExitEditMode();
      return true;
    }
    if (anyDirty() && !window.confirm('Discard your changes to this day’s plan?')) {
      return false;
    }
    setEditingAll(false);
    setSaveAllError(null);
    return true;
  }

  useImperativeHandle(
    ref,
    () => ({
      isEditing: () => (multiMealEdit ? editingAll : Boolean(editingMealId)),
      isDirty: () => anyDirty(),
      saveAll,
      cancelAll
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keep latest editing/save closures
    [multiMealEdit, editingAll, editingMealId, meals]
  );

  return (
    <>
      <div className="space-y-4">
        {saveAllError && (
          <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{saveAllError}</div>
        )}
        {meals.map((meal) => {
          const cardMeal = cardMeals.find((c) => c.mealNumber === meal.mealNumber);
          const mealEditing = multiMealEdit ? editingAll : meal.id === editingMealId;
          return (
            <MealCard
              key={meal.id}
              ref={(handle) => setEditorRef(meal.id, handle)}
              meal={meal}
              selectedDate={selectedDate}
              onChange={onChange}
              isEditing={mealEditing}
              onEnterEditMode={handleEnterEditMode}
              onExitEditMode={handleExitEditMode}
              onLogActual={onLogActual}
              onAiSuggestions={setSuggestionsMeal}
              onSwapMeal={setSwapMeal}
              selected={meal.id === selectedMealId}
              onSelect={onSelectMeal}
              onBuildMeal={cardMeal && onBuildMeal ? () => onBuildMeal(cardMeal.mealNumber) : undefined}
              macroTargets={cardMeal?.macroTargets}
              dailyTargets={cardMeal?.dailyTargets}
              onRequestSaveAll={multiMealEdit ? (opts) => void saveAll(opts) : undefined}
              onRequestCancelAll={multiMealEdit ? () => void cancelAll() : undefined}
              externalSaving={multiMealEdit ? savingAll : undefined}
              onDraftTotalsChange={
                mealEditing ? (totals) => handleDraftTotalsChange(meal.id, totals) : undefined
              }
            />
          );
        })}
      </div>

      <MealSwapDrawer
        open={swapMeal != null}
        sourceMeal={swapMeal}
        otherMeals={swapMeal ? meals.filter((meal) => meal.id !== swapMeal.id) : []}
        onClose={() => setSwapMeal(null)}
        onSaved={() => void onChange()}
      />

      <MealSuggestionsDrawer
        open={suggestionsMeal != null}
        date={selectedDate}
        meal={suggestionsMeal}
        onClose={() => setSuggestionsMeal(null)}
        onSaved={() => void onChange()}
      />
    </>
  );
});
