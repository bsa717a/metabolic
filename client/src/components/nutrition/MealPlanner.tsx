import { useEffect, useState } from 'react';
import type { Meal } from '../../types';
import { MealCard } from './MealCard';

export function MealPlanner({
  meals,
  selectedDate,
  onChange,
  onLogActual,
}: {
  meals: Meal[];
  selectedDate: string;
  onChange: () => void;
  onLogActual: (mealId: string) => void;
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

  return (
    <div className="space-y-4">
      {meals.map((meal) => (
        <MealCard
          key={meal.id}
          meal={meal}
          selectedDate={selectedDate}
          onChange={onChange}
          isEditing={meal.id === editingMealId}
          onEnterEditMode={handleEnterEditMode}
          onExitEditMode={handleExitEditMode}
          onLogActual={onLogActual}
        />
      ))}
    </div>
  );
}
