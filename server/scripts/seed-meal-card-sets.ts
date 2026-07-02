/**
 * Seeds the Meals 1–3 card sets from Tommy's "Weekly Meal Plan Builder" flows:
 *   Meal 1 Breakfast:  hot/cold → protein → carb → veggies → flavor & crunch → fruit
 *   Meal 2 Snack:      style → protein → carb → fat → boosters → fruit
 *   Meal 3 Lunch:      format → protein → carb → veggies → toppings & sauce → fruit
 *
 * Same approach as seed-dinner-card-set.ts (which owns the dinner set): upsert foods
 * by name with role tags, author each set with baseServings at its reference target
 * (the sum of the default scalable picks), attach to the matching template meal by
 * mealNumber, and store that meal's calorieTarget (item rollup, else day remainder).
 *
 * Dry-run by default:
 *   cd server && npx tsx --env-file=.env scripts/seed-meal-card-sets.ts [--apply]
 */
import { MealCardRole, MealSlotType, Prisma, PrismaClient, Visibility } from '@prisma/client';

const prisma = new PrismaClient();

const MIN_TARGET_KCAL = 150;

/** Parse template plannedTime ("18:30", "6:00pm") to a 0–23 hour, or null. */
function plannedHour(plannedTime: string | null): number | null {
  if (!plannedTime) return null;
  const match = plannedTime.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  if (match[3] === 'pm' && hour < 12) hour += 12;
  if (match[3] === 'am' && hour === 12) hour = 0;
  return hour;
}

function isDinnerMeal(meal: { name: string; plannedTime: string | null }): boolean {
  if (meal.name.toLowerCase().includes('dinner')) return true;
  const hour = plannedHour(meal.plannedTime);
  return hour != null && hour >= 17 && hour < 21;
}

function matchesMealSlot(meal: { name: string; plannedTime: string | null }, slotType: MealSlotType): boolean {
  const name = meal.name.toLowerCase();
  switch (slotType) {
    case 'BREAKFAST':
      if (name.includes('breakfast')) return true;
      { const hour = plannedHour(meal.plannedTime); return hour != null && hour >= 5 && hour < 11; }
    case 'SNACK':
      return name.includes('snack');
    case 'LUNCH':
      if (name.includes('lunch')) return true;
      { const hour = plannedHour(meal.plannedTime); return hour != null && hour >= 11 && hour < 15; }
    default:
      return false;
  }
}

type FoodSeed = {
  name: string;
  servingSize: number;
  servingUnit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  role: MealCardRole;
  isFreeFood?: boolean;
};

const FOODS: FoodSeed[] = [
  // breakfast proteins
  { name: 'Eggs', servingSize: 1, servingUnit: 'egg', calories: 70, protein: 6, carbs: 0, fat: 5, role: 'PROTEIN' },
  { name: 'Turkey sausage', servingSize: 2, servingUnit: 'oz', calories: 90, protein: 12, carbs: 1, fat: 4, role: 'PROTEIN' },
  { name: 'Bacon', servingSize: 1, servingUnit: 'slice', calories: 45, protein: 3, carbs: 0, fat: 3.5, role: 'PROTEIN' },
  { name: 'Greek yogurt, plain', servingSize: 0.5, servingUnit: 'cup', calories: 65, protein: 11, carbs: 4, fat: 0, role: 'PROTEIN' },
  { name: 'Cottage cheese', servingSize: 0.5, servingUnit: 'cup', calories: 90, protein: 12, carbs: 5, fat: 2.5, role: 'PROTEIN' },
  // breakfast carbs
  { name: 'Potatoes, roasted', servingSize: 0.5, servingUnit: 'cup', calories: 80, protein: 2, carbs: 18, fat: 0, role: 'CARB' },
  { name: 'Black beans', servingSize: 0.5, servingUnit: 'cup', calories: 110, protein: 7, carbs: 20, fat: 0.5, role: 'CARB' },
  { name: 'Oats, cooked', servingSize: 0.5, servingUnit: 'cup', calories: 80, protein: 3, carbs: 14, fat: 1.5, role: 'CARB' },
  { name: 'Sourdough toast', servingSize: 1, servingUnit: 'slice', calories: 90, protein: 3, carbs: 17, fat: 0.5, role: 'CARB' },
  // veggies
  { name: 'Spinach', servingSize: 1, servingUnit: 'cup', calories: 10, protein: 1, carbs: 1, fat: 0, role: 'VEGETABLE' },
  { name: 'Bell peppers', servingSize: 0.5, servingUnit: 'cup', calories: 15, protein: 0.5, carbs: 3, fat: 0, role: 'VEGETABLE' },
  { name: 'Onions, sautéed', servingSize: 0.5, servingUnit: 'cup', calories: 30, protein: 1, carbs: 7, fat: 0, role: 'VEGETABLE' },
  { name: 'Mushrooms', servingSize: 1, servingUnit: 'cup', calories: 15, protein: 2, carbs: 2, fat: 0, role: 'VEGETABLE' },
  { name: 'Tomatoes', servingSize: 0.5, servingUnit: 'cup', calories: 15, protein: 1, carbs: 3, fat: 0, role: 'VEGETABLE' },
  { name: 'Lettuce, shredded', servingSize: 1, servingUnit: 'cup', calories: 8, protein: 0.5, carbs: 1.5, fat: 0, role: 'VEGETABLE' },
  { name: 'Cucumbers', servingSize: 0.5, servingUnit: 'cup', calories: 8, protein: 0.5, carbs: 2, fat: 0, role: 'VEGETABLE' },
  { name: 'Red onion', servingSize: 0.25, servingUnit: 'cup', calories: 15, protein: 0.5, carbs: 3.5, fat: 0, role: 'VEGETABLE' },
  // fats / toppings
  { name: 'Avocado', servingSize: 0.25, servingUnit: 'avocado', calories: 60, protein: 0.5, carbs: 3, fat: 5.5, role: 'FAT' },
  { name: 'Shredded cheese', servingSize: 2, servingUnit: 'tbsp', calories: 55, protein: 3.5, carbs: 0.5, fat: 4.5, role: 'FAT' },
  { name: 'Pumpkin seeds', servingSize: 1, servingUnit: 'tbsp', calories: 45, protein: 2.5, carbs: 1, fat: 3.5, role: 'FAT' },
  { name: 'Almonds', servingSize: 0.5, servingUnit: 'oz', calories: 82, protein: 3, carbs: 3, fat: 7, role: 'FAT' },
  { name: 'Peanut butter', servingSize: 1, servingUnit: 'tbsp', calories: 95, protein: 4, carbs: 3, fat: 8, role: 'FAT' },
  { name: 'Walnuts', servingSize: 0.5, servingUnit: 'oz', calories: 92, protein: 2, carbs: 2, fat: 9, role: 'FAT' },
  { name: 'Olives', servingSize: 10, servingUnit: 'olives', calories: 40, protein: 0, carbs: 2, fat: 3.5, role: 'FAT' },
  { name: 'Greek yogurt sauce', servingSize: 2, servingUnit: 'tbsp', calories: 20, protein: 2, carbs: 1.5, fat: 0.5, role: 'FAT' },
  // snack proteins/carbs
  { name: 'String cheese', servingSize: 1, servingUnit: 'stick', calories: 80, protein: 7, carbs: 1, fat: 6, role: 'PROTEIN' },
  { name: 'Tuna salad', servingSize: 0.5, servingUnit: 'cup', calories: 180, protein: 16, carbs: 4, fat: 11, role: 'PROTEIN' },
  { name: 'Deli turkey', servingSize: 2, servingUnit: 'oz', calories: 60, protein: 11, carbs: 1, fat: 1, role: 'PROTEIN' },
  { name: 'Whole grain crackers', servingSize: 6, servingUnit: 'crackers', calories: 80, protein: 2, carbs: 13, fat: 2.5, role: 'CARB' },
  { name: 'Rice cakes', servingSize: 1, servingUnit: 'cake', calories: 35, protein: 1, carbs: 7, fat: 0, role: 'CARB' },
  { name: 'Gluten-free crackers', servingSize: 6, servingUnit: 'crackers', calories: 80, protein: 1, carbs: 14, fat: 2, role: 'CARB' },
  // boosters (fixed small amounts)
  { name: 'Chia seeds', servingSize: 1, servingUnit: 'tsp', calories: 20, protein: 1, carbs: 2, fat: 1.5, role: 'FREE' },
  { name: 'Cacao nibs', servingSize: 1, servingUnit: 'tsp', calories: 15, protein: 0.5, carbs: 1, fat: 1, role: 'FREE' },
  { name: 'Coconut flakes', servingSize: 1, servingUnit: 'tbsp', calories: 33, protein: 0.5, carbs: 1.5, fat: 3, role: 'FREE' },
  { name: 'Flax seeds', servingSize: 1, servingUnit: 'tsp', calories: 18, protein: 0.5, carbs: 1, fat: 1.5, role: 'FREE' },
  // lunch proteins/carbs
  { name: 'Grilled chicken breast', servingSize: 2, servingUnit: 'oz', calories: 70, protein: 13, carbs: 0, fat: 1.5, role: 'PROTEIN' },
  { name: 'Salmon, grilled', servingSize: 2, servingUnit: 'oz', calories: 100, protein: 11, carbs: 0, fat: 6, role: 'PROTEIN' },
  { name: 'Ground turkey, cooked', servingSize: 2, servingUnit: 'oz', calories: 60, protein: 12, carbs: 0, fat: 1, role: 'PROTEIN' },
  { name: 'Tofu, baked', servingSize: 3, servingUnit: 'oz', calories: 70, protein: 8, carbs: 2, fat: 4, role: 'PROTEIN' },
  { name: 'Brown rice, cooked', servingSize: 0.5, servingUnit: 'cup', calories: 110, protein: 2.5, carbs: 23, fat: 1, role: 'CARB' },
  { name: 'Quinoa, cooked', servingSize: 0.5, servingUnit: 'cup', calories: 110, protein: 4, carbs: 20, fat: 2, role: 'CARB' },
  { name: 'Whole wheat wrap', servingSize: 1, servingUnit: 'wrap', calories: 120, protein: 4, carbs: 20, fat: 3, role: 'CARB' },
  // fruit
  { name: 'Mixed berries', servingSize: 0.75, servingUnit: 'cup', calories: 60, protein: 1, carbs: 14, fat: 0, role: 'FRUIT' },
  { name: 'Blueberries', servingSize: 0.75, servingUnit: 'cup', calories: 63, protein: 1, carbs: 16, fat: 0, role: 'FRUIT' },
  { name: 'Strawberries', servingSize: 1, servingUnit: 'cup', calories: 50, protein: 1, carbs: 12, fat: 0, role: 'FRUIT' },
  { name: 'Banana', servingSize: 1, servingUnit: 'medium', calories: 105, protein: 1, carbs: 27, fat: 0, role: 'FRUIT' },
  { name: 'Apple', servingSize: 1, servingUnit: 'medium', calories: 95, protein: 0.5, carbs: 25, fat: 0, role: 'FRUIT' },
  { name: 'Grapes', servingSize: 0.5, servingUnit: 'cup', calories: 52, protein: 0.5, carbs: 14, fat: 0, role: 'FRUIT' },
  { name: 'Orange', servingSize: 1, servingUnit: 'medium', calories: 62, protein: 1, carbs: 15, fat: 0, role: 'FRUIT' },
  { name: 'Pineapple', servingSize: 0.5, servingUnit: 'cup', calories: 41, protein: 0.5, carbs: 11, fat: 0, role: 'FRUIT' },
  // reused from the dinner set (upsert keeps them single)
  { name: 'Sweet potato, roasted', servingSize: 0.5, servingUnit: 'cup', calories: 90, protein: 1, carbs: 21, fat: 0, role: 'CARB' },
  { name: 'Ground beef 90/10, cooked', servingSize: 2, servingUnit: 'oz', calories: 105, protein: 11, carbs: 0, fat: 6, role: 'PROTEIN' },
  { name: 'Salsa', servingSize: 2, servingUnit: 'tbsp', calories: 10, protein: 0, carbs: 2, fat: 0, role: 'FREE', isFreeFood: true },
  { name: 'Pico de gallo', servingSize: 2, servingUnit: 'tbsp', calories: 10, protein: 0, carbs: 2, fat: 0, role: 'FREE', isFreeFood: true },
  { name: 'Hot sauce', servingSize: 1, servingUnit: 'tsp', calories: 0, protein: 0, carbs: 0, fat: 0, role: 'FREE', isFreeFood: true }
];

type OptionSeed = {
  name: string;
  description?: string;
  icon?: string;
  isDefault?: boolean;
  foods: Array<{ food: string; baseServings: number; scalable?: boolean; discrete?: boolean }>;
};

type CardSeed = {
  role: MealCardRole;
  name: string;
  pickRule: string;
  required: boolean;
  maxSelect: number;
  options: OptionSeed[];
};

type SetSeed = {
  name: string;
  slotType: MealSlotType;
  cards: CardSeed[];
};

const SETS: SetSeed[] = [
  {
    name: 'Breakfast Builder',
    slotType: 'BREAKFAST',
    cards: [
      {
        role: 'STYLE', name: 'Hot or cold?', pickRule: 'Pick 1', required: true, maxSelect: 1,
        options: [
          { name: 'Hot', description: 'Scramble, hash, or bowl', icon: '🍳', isDefault: true, foods: [] },
          { name: 'Cold', description: 'Yogurt or overnight bowl', icon: '🥣', foods: [] }
        ]
      },
      {
        role: 'PROTEIN', name: 'Choose protein', pickRule: 'Pick 1', required: true, maxSelect: 1,
        options: [
          { name: 'Eggs', icon: '🥚', isDefault: true, foods: [{ food: 'Eggs', baseServings: 3, discrete: true }] },
          { name: 'Turkey sausage', icon: '🌭', foods: [{ food: 'Turkey sausage', baseServings: 2.3 }] },
          { name: 'Bacon', icon: '🥓', foods: [{ food: 'Bacon', baseServings: 4, discrete: true }] },
          { name: 'Greek yogurt', icon: '🥛', foods: [{ food: 'Greek yogurt, plain', baseServings: 3 }] },
          { name: 'Cottage cheese', icon: '🧀', foods: [{ food: 'Cottage cheese', baseServings: 2.3 }] }
        ]
      },
      {
        role: 'CARB', name: 'Choose carb', pickRule: 'Pick 1', required: true, maxSelect: 1,
        options: [
          { name: 'Sweet potato', icon: '🍠', isDefault: true, foods: [{ food: 'Sweet potato, roasted', baseServings: 1.5 }] },
          { name: 'Potatoes', icon: '🥔', foods: [{ food: 'Potatoes, roasted', baseServings: 1.7 }] },
          { name: 'Beans', icon: '🫘', foods: [{ food: 'Black beans', baseServings: 1.2 }] },
          { name: 'Oats', icon: '🥣', foods: [{ food: 'Oats, cooked', baseServings: 1.7 }] },
          { name: 'Sourdough toast', icon: '🍞', foods: [{ food: 'Sourdough toast', baseServings: 1.5, discrete: true }] }
        ]
      },
      {
        role: 'VEGETABLE', name: 'Choose veggies', pickRule: 'Pick 1 or more', required: true, maxSelect: 5,
        options: [
          { name: 'Spinach', icon: '🥬', isDefault: true, foods: [{ food: 'Spinach', baseServings: 1.5 }] },
          { name: 'Bell peppers', icon: '🫑', foods: [{ food: 'Bell peppers', baseServings: 1 }] },
          { name: 'Onions', icon: '🧅', foods: [{ food: 'Onions, sautéed', baseServings: 1 }] },
          { name: 'Mushrooms', icon: '🍄', foods: [{ food: 'Mushrooms', baseServings: 1 }] },
          { name: 'Tomatoes', icon: '🍅', foods: [{ food: 'Tomatoes', baseServings: 1 }] }
        ]
      },
      {
        role: 'FAT', name: 'Add flavor & crunch', pickRule: 'Pick 1 or more', required: false, maxSelect: 5,
        options: [
          { name: 'Avocado', icon: '🥑', isDefault: true, foods: [{ food: 'Avocado', baseServings: 1 }] },
          { name: 'Salsa / Pico', icon: '🌶️', foods: [{ food: 'Salsa', baseServings: 1, scalable: false }] },
          { name: 'Cheese', icon: '🧀', foods: [{ food: 'Shredded cheese', baseServings: 1 }] },
          { name: 'Pumpkin seeds', icon: '🎃', foods: [{ food: 'Pumpkin seeds', baseServings: 1 }] },
          { name: 'Hot sauce', icon: '🔥', foods: [{ food: 'Hot sauce', baseServings: 1, scalable: false }] }
        ]
      },
      {
        role: 'FRUIT', name: 'Add fruit', pickRule: 'Pick 1', required: true, maxSelect: 1,
        options: [
          { name: 'Mixed berries', icon: '🫐', isDefault: true, foods: [{ food: 'Mixed berries', baseServings: 1 }] },
          { name: 'Blueberries', icon: '🫐', foods: [{ food: 'Blueberries', baseServings: 1 }] },
          { name: 'Strawberries', icon: '🍓', foods: [{ food: 'Strawberries', baseServings: 1 }] },
          { name: 'Banana', icon: '🍌', foods: [{ food: 'Banana', baseServings: 1, discrete: true }] },
          { name: 'Apple', icon: '🍎', foods: [{ food: 'Apple', baseServings: 1, discrete: true }] }
        ]
      }
    ]
  },
  {
    name: 'Snack / Mini Meal Builder',
    slotType: 'SNACK',
    cards: [
      {
        role: 'STYLE', name: 'Choose style', pickRule: 'Pick 1 — what sounds good?', required: true, maxSelect: 1,
        options: [
          { name: 'Quick snack', description: 'Grab-and-go pieces', icon: '⚡', isDefault: true, foods: [] },
          { name: 'Mini meal', description: 'A small plate', icon: '🍽️', foods: [] }
        ]
      },
      {
        role: 'PROTEIN', name: 'Choose protein', pickRule: 'Pick 1', required: true, maxSelect: 1,
        options: [
          { name: 'String cheese', icon: '🧀', isDefault: true, foods: [{ food: 'String cheese', baseServings: 2, discrete: true }] },
          { name: 'Greek yogurt', icon: '🥛', foods: [{ food: 'Greek yogurt, plain', baseServings: 2.5 }] },
          { name: 'Cottage cheese', icon: '🥣', foods: [{ food: 'Cottage cheese', baseServings: 1.8 }] },
          { name: 'Tuna salad', icon: '🐟', foods: [{ food: 'Tuna salad', baseServings: 0.9 }] },
          { name: 'Deli meat', icon: '🥩', foods: [{ food: 'Deli turkey', baseServings: 2.7 }] }
        ]
      },
      {
        role: 'CARB', name: 'Choose carb', pickRule: 'Pick 1', required: true, maxSelect: 1,
        options: [
          { name: 'Crackers', icon: '🍘', isDefault: true, foods: [{ food: 'Whole grain crackers', baseServings: 1.2 }] },
          { name: 'Rice cakes', icon: '🍙', foods: [{ food: 'Rice cakes', baseServings: 3, discrete: true }] },
          { name: 'Gluten-free crackers', icon: '🌾', foods: [{ food: 'Gluten-free crackers', baseServings: 1.2 }] },
          { name: 'Sweet potato', icon: '🍠', foods: [{ food: 'Sweet potato, roasted', baseServings: 1 }] }
        ]
      },
      {
        role: 'FAT', name: 'Choose fat', pickRule: 'Pick 1', required: true, maxSelect: 1,
        options: [
          { name: 'Almonds', icon: '🥜', isDefault: true, foods: [{ food: 'Almonds', baseServings: 1 }] },
          { name: 'Peanut butter', icon: '🥜', foods: [{ food: 'Peanut butter', baseServings: 1 }] },
          { name: 'Avocado', icon: '🥑', foods: [{ food: 'Avocado', baseServings: 1.3 }] },
          { name: 'Walnuts', icon: '🌰', foods: [{ food: 'Walnuts', baseServings: 1 }] },
          { name: 'Olives', icon: '🫒', foods: [{ food: 'Olives', baseServings: 2 }] }
        ]
      },
      {
        role: 'FREE', name: 'Add boosters', pickRule: 'Pick 1 or more — small fixed amounts', required: false, maxSelect: 5,
        options: [
          { name: 'Chia seeds', icon: '🌱', isDefault: true, foods: [{ food: 'Chia seeds', baseServings: 1, scalable: false }] },
          { name: 'Berries', icon: '🫐', foods: [{ food: 'Mixed berries', baseServings: 0.33, scalable: false }] },
          { name: 'Cacao nibs', icon: '🍫', foods: [{ food: 'Cacao nibs', baseServings: 1, scalable: false }] },
          { name: 'Coconut flakes', icon: '🥥', foods: [{ food: 'Coconut flakes', baseServings: 1, scalable: false }] },
          { name: 'Flax seeds', icon: '🌾', foods: [{ food: 'Flax seeds', baseServings: 1, scalable: false }] }
        ]
      },
      {
        role: 'FRUIT', name: 'Add fruit', pickRule: 'Pick 1', required: true, maxSelect: 1,
        options: [
          { name: 'Apple slices', icon: '🍎', isDefault: true, foods: [{ food: 'Apple', baseServings: 0.5 }] },
          { name: 'Berries', icon: '🫐', foods: [{ food: 'Mixed berries', baseServings: 0.7 }] },
          { name: 'Grapes', icon: '🍇', foods: [{ food: 'Grapes', baseServings: 1 }] },
          { name: 'Banana', icon: '🍌', foods: [{ food: 'Banana', baseServings: 0.5 }] },
          { name: 'Orange', icon: '🍊', foods: [{ food: 'Orange', baseServings: 1, discrete: true }] }
        ]
      }
    ]
  },
  {
    name: 'Lunch Builder',
    slotType: 'LUNCH',
    cards: [
      {
        role: 'STYLE', name: 'Choose format', pickRule: 'Pick 1 — how do you want it?', required: true, maxSelect: 1,
        options: [
          { name: 'Wrap', description: 'Rolled and portable', icon: '🌯', isDefault: true, foods: [] },
          { name: 'Bowl', description: 'Everything over a base', icon: '🥣', foods: [] },
          { name: 'Meal prep', description: 'Batch it for the week', icon: '🍱', foods: [] }
        ]
      },
      {
        role: 'PROTEIN', name: 'Choose protein', pickRule: 'Pick 1', required: true, maxSelect: 1,
        options: [
          { name: 'Grilled chicken', icon: '🍗', isDefault: true, foods: [{ food: 'Grilled chicken breast', baseServings: 3 }] },
          { name: 'Ground beef', icon: '🥩', foods: [{ food: 'Ground beef 90/10, cooked', baseServings: 2 }] },
          { name: 'Salmon', icon: '🐟', foods: [{ food: 'Salmon, grilled', baseServings: 2.1 }] },
          { name: 'Turkey', icon: '🦃', foods: [{ food: 'Ground turkey, cooked', baseServings: 3.5 }] },
          { name: 'Tofu', icon: '🧊', foods: [{ food: 'Tofu, baked', baseServings: 3 }] }
        ]
      },
      {
        role: 'CARB', name: 'Choose carb', pickRule: 'Pick 1', required: true, maxSelect: 1,
        options: [
          { name: 'Brown rice', icon: '🍚', isDefault: true, foods: [{ food: 'Brown rice, cooked', baseServings: 1.3 }] },
          { name: 'Quinoa', icon: '🌾', foods: [{ food: 'Quinoa, cooked', baseServings: 1.3 }] },
          { name: 'Black beans', icon: '🫘', foods: [{ food: 'Black beans', baseServings: 1.3 }] },
          { name: 'Sweet potato', icon: '🍠', foods: [{ food: 'Sweet potato, roasted', baseServings: 1.6 }] },
          { name: 'Whole wheat wrap', icon: '🌯', foods: [{ food: 'Whole wheat wrap', baseServings: 1, discrete: true }] }
        ]
      },
      {
        role: 'VEGETABLE', name: 'Add veggies', pickRule: 'Pick 2 or more', required: true, maxSelect: 5,
        options: [
          { name: 'Lettuce', icon: '🥬', isDefault: true, foods: [{ food: 'Lettuce, shredded', baseServings: 1.5 }] },
          { name: 'Tomatoes', icon: '🍅', foods: [{ food: 'Tomatoes', baseServings: 1 }] },
          { name: 'Cucumbers', icon: '🥒', foods: [{ food: 'Cucumbers', baseServings: 1 }] },
          { name: 'Peppers', icon: '🫑', foods: [{ food: 'Bell peppers', baseServings: 1 }] },
          { name: 'Red onion', icon: '🧅', foods: [{ food: 'Red onion', baseServings: 1 }] }
        ]
      },
      {
        role: 'FAT', name: 'Add toppings & sauce', pickRule: 'Pick 1 or more', required: false, maxSelect: 5,
        options: [
          { name: 'Avocado', icon: '🥑', isDefault: true, foods: [{ food: 'Avocado', baseServings: 1 }] },
          { name: 'Cheese', icon: '🧀', foods: [{ food: 'Shredded cheese', baseServings: 1 }] },
          { name: 'Salsa', icon: '🌶️', foods: [{ food: 'Salsa', baseServings: 1, scalable: false }] },
          { name: 'Greek yogurt sauce', icon: '🥛', foods: [{ food: 'Greek yogurt sauce', baseServings: 1, scalable: false }] },
          { name: 'Olives', icon: '🫒', foods: [{ food: 'Olives', baseServings: 1, scalable: false }] }
        ]
      },
      {
        role: 'FRUIT', name: 'Add fruit', pickRule: 'Pick 1', required: true, maxSelect: 1,
        options: [
          { name: 'Pineapple', icon: '🍍', isDefault: true, foods: [{ food: 'Pineapple', baseServings: 1 }] },
          { name: 'Berries', icon: '🫐', foods: [{ food: 'Mixed berries', baseServings: 0.7 }] },
          { name: 'Grapes', icon: '🍇', foods: [{ food: 'Grapes', baseServings: 1 }] },
          { name: 'Apple', icon: '🍎', foods: [{ food: 'Apple', baseServings: 1, discrete: true }] },
          { name: 'Orange', icon: '🍊', foods: [{ food: 'Orange', baseServings: 1, discrete: true }] }
        ]
      }
    ]
  }
];

/** Reference calories = the default picks of the scalable (non-STYLE, non-fixed) cards. */
function referenceCalories(set: SetSeed): number {
  const byName = new Map(FOODS.map((f) => [f.name, f]));
  let total = 0;
  for (const card of set.cards) {
    if (card.role === 'STYLE') continue;
    const def = card.options.find((o) => o.isDefault);
    for (const line of def?.foods ?? []) {
      if (line.scalable === false) continue;
      total += (byName.get(line.food)?.calories ?? 0) * line.baseServings;
    }
  }
  return Math.round(total * 100) / 100;
}

async function upsertFoods(apply: boolean) {
  const foodIds = new Map<string, string>();
  for (const seed of FOODS) {
    const existing = await prisma.food.findFirst({
      where: { name: { equals: seed.name, mode: 'insensitive' }, visibility: Visibility.GLOBAL },
      orderBy: { createdAt: 'asc' }
    });
    if (existing) {
      foodIds.set(seed.name, existing.id);
      if (apply) {
        await prisma.food.update({
          where: { id: existing.id },
          data: { role: seed.role, isFreeFood: seed.isFreeFood ?? false }
        });
      }
    } else {
      console.log(`  food create: ${seed.name} (${seed.calories} kcal / ${seed.servingSize} ${seed.servingUnit})`);
      if (apply) {
        const created = await prisma.food.create({
          data: {
            name: seed.name,
            servingSize: new Prisma.Decimal(seed.servingSize),
            servingUnit: seed.servingUnit,
            calories: new Prisma.Decimal(seed.calories),
            protein: new Prisma.Decimal(seed.protein),
            carbs: new Prisma.Decimal(seed.carbs),
            fat: new Prisma.Decimal(seed.fat),
            visibility: Visibility.GLOBAL,
            role: seed.role,
            isFreeFood: seed.isFreeFood ?? false
          }
        });
        foodIds.set(seed.name, created.id);
      }
    }
  }
  return foodIds;
}

async function seedSet(set: SetSeed, foodIds: Map<string, string>, apply: boolean) {
  const refKcal = referenceCalories(set);
  let setId: string | null = null;
  const existing = await prisma.mealCardSet.findFirst({ where: { name: set.name } });
  if (existing) {
    setId = existing.id;
    console.log(`  set exists: ${set.name} (${existing.id})`);
  } else {
    console.log(`  set create: ${set.name} — ref ${refKcal} kcal, ${set.cards.length} cards`);
    if (apply) {
      const created = await prisma.mealCardSet.create({
        data: {
          name: set.name,
          slotType: set.slotType,
          referenceCalories: new Prisma.Decimal(refKcal),
          cards: {
            create: set.cards.map((card, cardIndex) => ({
              role: card.role,
              name: card.name,
              pickRule: card.pickRule,
              required: card.required,
              maxSelect: card.maxSelect,
              sortOrder: cardIndex + 1,
              options: {
                create: card.options.map((option, optionIndex) => ({
                  name: option.name,
                  description: option.description ?? null,
                  icon: option.icon ?? null,
                  isDefault: option.isDefault ?? false,
                  sortOrder: optionIndex + 1,
                  foods: {
                    create: option.foods.map((line) => ({
                      foodId: foodIds.get(line.food)!,
                      baseServings: new Prisma.Decimal(line.baseServings),
                      scalable: line.scalable ?? true,
                      discrete: line.discrete ?? false
                    }))
                  }
                }))
              }
            }))
          }
        }
      });
      setId = created.id;
    }
  }

  // Attach to every template's matching meals (by name/time slot, not fixed meal numbers)
  const templates = await prisma.nutritionPlanTemplate.findMany({
    include: { meals: { include: { items: true }, orderBy: { mealNumber: 'asc' } } }
  });
  let attached = 0;
  for (const template of templates) {
    const meals = template.meals.filter(
      (m) => matchesMealSlot(m, set.slotType) && !isDinnerMeal(m)
    );
    for (const meal of meals) {
      const itemRollup = meal.items.reduce((s, i) => s + Number(i.calories), 0);
      const otherRollup = template.meals
        .filter((m) => m.id !== meal.id)
        .reduce((s, m) => s + m.items.reduce((s2, i) => s2 + Number(i.calories), 0), 0);
      const remainder = Number(template.calorieTarget) - otherRollup;
      const target = Math.max(itemRollup > 0 ? itemRollup : remainder, MIN_TARGET_KCAL);
      attached += 1;
      if (apply && setId) {
        await prisma.nutritionTemplateMeal.update({
          where: { id: meal.id },
          data: { mealCardSetId: setId, calorieTarget: new Prisma.Decimal(target.toFixed(2)) }
        });
      }
    }
  }
  console.log(`  attach ${set.name} → ${attached} ${set.slotType.toLowerCase()} meals`);
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`Meals 1–3 card sets ${apply ? '(APPLY)' : '(dry run — pass --apply to write)'}`);
  const foodIds = await upsertFoods(apply);
  for (const set of SETS) {
    await seedSet(set, foodIds, apply);
  }
  console.log(apply ? 'Done.' : 'Dry run complete — nothing written.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
