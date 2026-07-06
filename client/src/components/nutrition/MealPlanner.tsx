import { useEffect, useState } from 'react';
import type { Meal } from '../../types';
import { MealCard } from './MealCard';
import { MealSuggestionsDrawer } from './MealSuggestionsDrawer';
import { MealSwapDrawer } from './MealSwapDrawer';
import type { MealMacroTargets } from './MealCardEditor';

export type CardMealInfo = {
  mealNumber: number;
  slotType: 'BREAKFAST' | 'SNACK' | 'LUNCH' | 'DINNER';
  macroTargets: MealMacroTargets;
  dailyTargets: MealMacroTargets | null;
};

export function MealPlanner({
  meals,
  selectedDate,
  onChange,
  onLogActual,
  selectedMealId,
  onSelectMeal,
  cardMeals = [],
  onBuildMeal,
}: {
  meals: Meal[];
  selectedDate: string;
  onChange: () => void;
  onLogActual: (mealId: string) => void;
  selectedMealId?: string;
  onSelectMeal?: (mealId: string) => void;
  cardMeals?: CardMealInfo[];
  onBuildMeal?: (mealNumber: number) => void;
}) {
  const [editingMealId, setEditingMealId] = useState<string | undefined>();
  const [swapMeal, setSwapMeal] = useState<Meal | null>(null);
  const [suggestionsMeal, setSuggestionsMeal] = useState<Meal | null>(null);

  useEffect(() => {
    setEditingMealId(undefined);
    setSwapMeal(null);
    setSuggestionsMeal(null);
  }, [selectedDate]);

  function handleEnterEditMode(mealId: string) {
    if (editingMealId && editingMealId !== mealId) {
      if (!window.confirm('You are currently editing another meal. Discard your changes?')) return;
    }
    setEditingMealId(mealId);
  }

  function handleExitEditMode() {
    setEditingMealId(undefined);
  }

  return (
    <>
      <div className="space-y-4">
        {meals.map((meal) => {
          const cardMeal = cardMeals.find((c) => c.mealNumber === meal.mealNumber);
          return (
            <MealCard
              key={meal.id}
              meal={meal}
              selectedDate={selectedDate}
              onChange={onChange}
              isEditing={meal.id === editingMealId}
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
}
