type MealIconName = 'breakfast' | 'lunch' | 'dinner' | 'snack';

function mealIconName(name: string): MealIconName {
  const normalized = name.toLowerCase();
  if (normalized.includes('breakfast')) return 'breakfast';
  if (normalized.includes('lunch')) return 'lunch';
  if (normalized.includes('dinner')) return 'dinner';
  return 'snack';
}

const LABEL: Record<MealIconName, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack'
};

export function MealTypeIcon({ name }: { name: string }) {
  const icon = mealIconName(name);
  return (
    <img
      src={`/meal-icons/${icon}-80.png`}
      srcSet={`/meal-icons/${icon}-80.png 80w, /meal-icons/${icon}-128.png 128w`}
      sizes="40px"
      width={40}
      height={40}
      alt=""
      title={LABEL[icon]}
      className="size-10 shrink-0 rounded-xl object-contain"
    />
  );
}
