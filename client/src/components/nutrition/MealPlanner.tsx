import { useEffect, useState } from 'react';
import type { Meal } from '../../types';
import { MealCard } from './MealCard';

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
  cardMeals?: Array<{ mealNumber: number; slotType: 'BREAKFAST' | 'SNACK' | 'LUNCH' | 'DINNER' }>;
  onBuildMeal?: (mealNumber: number) => void;
}) {
  const [editingMealId, setEditingMealId] = useState<string | undefined>();

  useEffect(() => {
    setEditingMealId(undefined);
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

  const slotLabels = { BREAKFAST: 'Build breakfast', SNACK: 'Build snack', LUNCH: 'Build lunch', DINNER: 'Build dinner' } as const;

  return (
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
            selected={meal.id === selectedMealId}
            onSelect={onSelectMeal}
            buildLabel={cardMeal ? slotLabels[cardMeal.slotType] : undefined}
            onBuildMeal={cardMeal && onBuildMeal ? () => onBuildMeal(cardMeal.mealNumber) : undefined}
          />
        );
      })}
    </div>
  );
}
