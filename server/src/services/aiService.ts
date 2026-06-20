import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { env } from '../config/env.js';
import { formatGroceryDescription } from '../utils/groceryConversion.js';

export type FoodEstimate = {
  normalizedFoodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
};

export type ExerciseEstimate = {
  name: string;
  description: string;
  category: string | null;
  bodyPart: string | null;
  defaultSets: number | null;
  defaultReps: number | null;
  defaultDurationMinutes: number | null;
  confidence: number;
};

export type MealSuggestion = {
  name: string;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MealSuggestionResult = {
  intro: string;
  options: MealSuggestion[];
};

export type ShoppingListInputItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  occurrenceCount: number;
};

export type EnrichedShoppingListItem = {
  id: string;
  groceryDescription: string;
  groceryCategory: string;
  storeLocation: string | null;
  notes: string | null;
};

export type EnrichedShoppingListResult = {
  intro: string;
  items: EnrichedShoppingListItem[];
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ChatChannel = 'web' | 'sms';

/** LOG = report food already eaten; SUGGEST = ask what to eat; CHAT = anything else. */
export type NutritionIntent = 'LOG' | 'SUGGEST' | 'CHAT';

export interface AiProvider {
  lookupFood(input: string): Promise<FoodEstimate[]>;
  lookupFoodFromImage(image: { data: string; mimeType: string }, input?: string): Promise<FoodEstimate[]>;
  lookupExercises(input: string): Promise<ExerciseEstimate[]>;
  suggestMealOptions(input: string, context: string): Promise<MealSuggestionResult>;
  enrichShoppingList(items: ShoppingListInputItem[], storeName?: string | null): Promise<EnrichedShoppingListResult>;
  chat(messages: ChatMessage[], context: string, channel?: ChatChannel): Promise<string>;
  classifyNutritionIntent(message: string): Promise<NutritionIntent>;
}

const foodEstimateSchema = z.object({
  normalizedFoodName: z.string().min(1),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  confidence: z.number().min(0).max(1)
});

const foodLookupResponseSchema = z.union([
  z.object({ items: z.array(foodEstimateSchema).min(1) }),
  foodEstimateSchema.transform((item) => ({ items: [item] }))
]);

const looseFoodLookupResponseSchema = z.union([
  z.object({ items: z.array(foodEstimateSchema) }),
  z.array(foodEstimateSchema).transform((items) => ({ items })),
  foodEstimateSchema.transform((item) => ({ items: [item] }))
]);

function normalizeExerciseCategory(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.includes('cardio') || normalized.includes('endurance') || normalized.includes('run')) return 'Cardio';
  if (normalized.includes('recover') || normalized.includes('mobil') || normalized.includes('stretch') || normalized.includes('yoga')) {
    return 'Recovery';
  }
  if (normalized.includes('strength') || normalized.includes('resist') || normalized.includes('weight')) return 'Strength';
  return null;
}

const EXERCISE_BODY_PARTS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Forearms',
  'Core',
  'Legs',
  'Glutes',
  'Calves',
  'Full Body'
] as const;

function normalizeExerciseBodyPart(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  const exact = EXERCISE_BODY_PARTS.find((part) => part.toLowerCase() === normalized);
  if (exact) return exact;
  if (normalized.includes('bicep')) return 'Biceps';
  if (normalized.includes('tricep')) return 'Triceps';
  if (normalized.includes('chest')) return 'Chest';
  if (normalized.includes('back') || normalized.includes('lat')) return 'Back';
  if (normalized.includes('shoulder')) return 'Shoulders';
  if (normalized.includes('forearm')) return 'Forearms';
  if (normalized.includes('core') || normalized.includes('abs') || normalized.includes('ab ')) return 'Core';
  if (normalized.includes('glute')) return 'Glutes';
  if (normalized.includes('calf') || normalized.includes('calves')) return 'Calves';
  if (normalized.includes('leg') || normalized.includes('quad') || normalized.includes('hamstring')) return 'Legs';
  if (normalized.includes('full')) return 'Full Body';
  return null;
}

const exerciseCategorySchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => normalizeExerciseCategory(value ?? null));

const exerciseBodyPartSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => normalizeExerciseBodyPart(value ?? null));

const optionalInt = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
  });

const exerciseEstimateSchema = z.object({
  name: z.union([z.string(), z.number()]).transform((value) => String(value).trim()).pipe(z.string().min(1)),
  description: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      const text = value == null ? '' : String(value).trim();
      return text || 'Perform with controlled form and steady breathing.';
    })
    .pipe(z.string().min(1).max(500)),
  category: exerciseCategorySchema,
  bodyPart: exerciseBodyPartSchema,
  defaultSets: optionalInt,
  defaultReps: optionalInt,
  defaultDurationMinutes: optionalInt,
  confidence: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((value) => {
      const parsed = value == null || value === '' ? 0.75 : Number(value);
      return roundConfidence(Number.isFinite(parsed) ? parsed : 0.75);
    })
});

const exerciseLookupResponseSchema = z.object({
  items: z.array(exerciseEstimateSchema).min(1).max(8)
});

const mealSuggestionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(240),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative()
});

const mealSuggestionResponseSchema = z.object({
  intro: z.string().min(1).max(300).optional(),
  options: z.array(mealSuggestionSchema).min(1).max(5)
});

const enrichedShoppingListItemSchema = z.object({
  id: z.string().min(1),
  groceryDescription: z.string().min(1).max(160),
  groceryCategory: z.string().min(1).max(80),
  storeLocation: z.union([z.string().max(120), z.null()]).optional(),
  notes: z.union([z.string().max(160), z.null()]).optional()
});

const enrichedShoppingListResponseSchema = z.object({
  intro: z.string().min(1).max(320).optional(),
  items: z.array(enrichedShoppingListItemSchema).min(1)
});

const FOOD_LOOKUP_PROMPT = `Estimate nutrition for each distinct food in the input.
Return JSON only: { "items": [ { "normalizedFoodName": string (include portion), "calories": number, "protein": grams, "carbs": grams, "fat": grams, "confidence": 0-1 }, ... ] }
Each food line must be its own item. Never combine multiple foods into one entry.`;

const EXERCISE_LOOKUP_PROMPT = `Suggest relevant exercises for the user's query.
Return JSON only: { "items": [ { "name": string, "description": string (1 short sentence on form and cues), "category": "Strength"|"Cardio"|"Recovery"|null, "bodyPart": "Chest"|"Back"|"Shoulders"|"Biceps"|"Triceps"|"Forearms"|"Core"|"Legs"|"Glutes"|"Calves"|"Full Body"|null, "defaultSets": number|null, "defaultReps": number|null, "defaultDurationMinutes": number|null, "confidence": 0-1 }, ... ] }
Return exactly 4 distinct exercises. Keep descriptions under 140 characters. Use Strength for resistance work, Cardio for endurance, Recovery for mobility/stretching. Set bodyPart to the primary muscle group trained.`;

const MEAL_SUGGESTION_PROMPT = `Suggest restaurant or meal choices that fit the user's current macro context.
Use common menu knowledge when the user names a restaurant, but make clear options are approximate.
If the user mentions multiple restaurants, include a useful spread across those restaurants instead of only one.
Respect the user's allergies and dietary preferences from the macro context — never suggest an option that conflicts with them.
Return JSON only: { "intro": string, "options": [ { "name": string, "description": string, "calories": number, "protein": grams, "carbs": grams, "fat": grams }, ... ] }
Return 3 practical, distinct options. Keep intro conversational and under 220 characters. Keep each description under 160 characters.`;

const SHOPPING_LIST_PROMPT = `Convert planned meal items into practical grocery-store shopping quantities.
Use packages, weights, counts, bunches, bags, and other units shoppers actually buy.
When planned unit is "serving", read the portion size from the food name (e.g. "1 cup almond milk" × 12 servings = 1 gallon almond milk).
When the planned amount is in cups, ounces, milliliters, or servings of liquids, convert to store sizes such as quart, half gallon, gallon, loaf, lb block, or bottle — never output "12 grocery portion(s)" or repeat the per-serving amount.
Do not repeat the meal-plan portion in groceryDescription (e.g. avoid "1 cup" in the product name).
Round up slightly when needed so the shopper has enough for the planned amount.
If a store name is provided, include a typical aisle or section for that chain. Approximate is fine.
If no store is provided, set storeLocation to null and use a sensible groceryCategory such as Produce, Meat & Seafood, Dairy & Eggs, Bakery, Pantry, Frozen, Beverages, or Other.
Return JSON only: { "intro": string, "items": [ { "id": string, "groceryDescription": string, "groceryCategory": string, "storeLocation": string|null, "notes": string|null }, ... ] }
Every input id must appear exactly once. Keep groceryDescription under 120 characters.`;

const MEAL_SUGGESTION_TIMEOUT_MS = 7000;
const SHOPPING_LIST_TIMEOUT_MS = 12000;
const CLASSIFY_INTENT_TIMEOUT_MS = 4000;

const CLASSIFY_INTENT_PROMPT = `Classify the user's text message into exactly one nutrition intent.
LOG = they are reporting food they already ate or are eating right now (it should be logged). Examples: "had a burrito bowl", "just ate 6 oz chicken and rice", "finished my lunch", "2 oz peanuts for breakfast".
SUGGEST = they are asking what/where to eat or naming a place and want recommendations (do NOT log yet). Examples: "what should I get at Chipotle?", "I'm at the airport, ideas?", "any good high protein options?".
CHAT = anything else: greetings, status checks, complaints about a previous log, corrections, or non-food messages. Examples: "why did you log that to lunch?", "thanks", "calories remaining" (if not clearly logging food).
Return JSON only: { "intent": "LOG" | "SUGGEST" | "CHAT" }`;

const classifyIntentSchema = z.object({
  intent: z.enum(['LOG', 'SUGGEST', 'CHAT'])
});

const ASSISTANT_SYSTEM = `You are the user's personal nutritionist friend inside the Metabolic app — warm, upbeat, and genuinely in their corner, like a knowledgeable friend who happens to be a great nutrition coach.
Talk like a real person, not a clinician: friendly, encouraging, and never preachy. Use the user's first name occasionally when it feels natural.
Answer using the user's live program data, macros, meals, allergies, and dietary preferences when relevant. Be practical and specific.
Never recommend foods that conflict with the user's stated allergies or dietary preferences.
Keep responses short unless they ask for detail. Use plain language, not markdown headers.
If data is missing, say what you would need rather than inventing numbers.
Celebrate real wins — meals logged, workouts done, protein hit, consistency — and keep encouragement genuine and tied to their actual progress, never generic hype.`;

const SMS_ASSISTANT_ADDENDUM = `You are texting the user like a nutritionist friend over SMS or iMessage. Sound human, warm, and concise — a friend who texts back fast.
Keep answers under 320 characters when you can. Hard limit 1500 characters.
Use plain text only — no markdown, bullets, asterisks, or headers. When listing meals or options, use short numbered lines.
Use the user's actual meals, macros, targets, allergies, and dietary preferences from context — never invent foods or numbers, and never suggest anything that conflicts with their allergies or preferences.
When they ask about their next meal, answer from the nextMeal field in context (name, plannedTime, items). Do not pick the first meal in upcomingMeals if nextMeal points to a different one.
You cannot change the user's data. Never claim you logged food or marked something complete unless the program data already shows it.
They can text you what they ate (e.g. "had 6 oz chicken and rice for lunch") and the system logs it for them — you cannot log food yourself. They can also say "Add 2 oz peanuts to breakfast" or "Log chicken for dinner". Food can be added to a meal even after it is marked complete. Meal photos return a calorie estimate only unless they ask to log in the caption (e.g. "log this for lunch") or text "log that for lunch" after the estimate.
To mark a meal eaten as planned, they can say "mark lunch complete" or "mark breakfast as eaten". To finish workouts, "mark all exercises done" or "mark done". To log water, "16 oz water" or "drank a glass of water".
If they say a log went to the wrong meal, they can text "that should be breakfast" and the system moves the last logged food. If they hit a meal error, suggest concrete examples like "Add 2 oz peanuts to breakfast" rather than only apologizing.
End with a brief, genuine line of encouragement when it fits. One short sentence, never cheesy.`;

function normalizeEstimate(parsed: z.infer<typeof foodEstimateSchema>): FoodEstimate {
  return {
    ...parsed,
    normalizedFoodName: parsed.normalizedFoodName.trim(),
    calories: Math.round(parsed.calories),
    protein: roundMacro(parsed.protein),
    carbs: roundMacro(parsed.carbs),
    fat: roundMacro(parsed.fat),
    confidence: roundConfidence(parsed.confidence)
  };
}

function normalizeExerciseEstimate(parsed: z.infer<typeof exerciseEstimateSchema>): ExerciseEstimate {
  return {
    name: parsed.name.trim(),
    description: parsed.description.trim(),
    category: parsed.category ?? null,
    bodyPart: parsed.bodyPart ?? null,
    defaultSets: parsed.defaultSets ?? null,
    defaultReps: parsed.defaultReps ?? null,
    defaultDurationMinutes: parsed.defaultDurationMinutes ?? null,
    confidence: roundConfidence(parsed.confidence)
  };
}

function splitFoodLines(input: string) {
  return input
    .split(/\n|,|;|•/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 2);
}

function parseModelJson(text: string) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Model returned invalid JSON');
    return JSON.parse(match[0]);
  }
}

function parseFoodLookupResponse(text: string) {
  const parsed = parseModelJson(text);
  const result = foodLookupResponseSchema.safeParse(parsed);
  if (result.success) return result.data.items.map(normalizeEstimate);

  const loose = looseFoodLookupResponseSchema.safeParse(parsed);
  if (loose.success) {
    if (loose.data.items.length === 0) {
      throw new Error('Model returned no food items');
    }
    return loose.data.items.map(normalizeEstimate);
  }

  throw result.error;
}

function parseExerciseLookupResponse(text: string) {
  const parsed = parseModelJson(text);
  const result = exerciseLookupResponseSchema.safeParse(parsed);
  if (result.success) return result.data.items.map(normalizeExerciseEstimate);

  const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [parsed];
  const normalized: ExerciseEstimate[] = [];
  for (const item of items) {
    const parsedItem = exerciseEstimateSchema.safeParse(item);
    if (parsedItem.success) normalized.push(normalizeExerciseEstimate(parsedItem.data));
  }

  if (!normalized.length) {
    throw result.error;
  }

  return normalized;
}

function normalizeMealSuggestion(parsed: z.infer<typeof mealSuggestionSchema>): MealSuggestion {
  return {
    name: parsed.name.trim(),
    description: parsed.description.trim(),
    calories: Math.round(parsed.calories),
    protein: roundMacro(parsed.protein),
    carbs: roundMacro(parsed.carbs),
    fat: roundMacro(parsed.fat)
  };
}

function parseMealSuggestionResponse(text: string): MealSuggestionResult {
  const parsed = parseModelJson(text);
  const result = mealSuggestionResponseSchema.safeParse(parsed);
  if (result.success) {
    return {
      intro: result.data.intro?.trim() || 'Here are a few options that should keep you close without overcomplicating lunch.',
      options: result.data.options.map(normalizeMealSuggestion)
    };
  }

  const options = Array.isArray(parsed?.options) ? parsed.options : Array.isArray(parsed) ? parsed : [parsed];
  const normalized: MealSuggestion[] = [];
  for (const option of options) {
    const parsedOption = mealSuggestionSchema.safeParse(option);
    if (parsedOption.success) normalized.push(normalizeMealSuggestion(parsedOption.data));
  }
  if (normalized.length) {
    return {
      intro: 'Here are a few options that should keep you close without overcomplicating lunch.',
      options: normalized.slice(0, 5)
    };
  }

  throw result.error;
}

function normalizeEnrichedShoppingListItem(parsed: z.infer<typeof enrichedShoppingListItemSchema>): EnrichedShoppingListItem {
  return {
    id: parsed.id,
    groceryDescription: parsed.groceryDescription.trim(),
    groceryCategory: parsed.groceryCategory.trim(),
    storeLocation: parsed.storeLocation?.trim() || null,
    notes: parsed.notes?.trim() || null
  };
}

function parseEnrichedShoppingListResponse(text: string, expectedIds: string[]): EnrichedShoppingListResult {
  const parsed = parseModelJson(text);
  const result = enrichedShoppingListResponseSchema.safeParse(parsed);
  const items = result.success
    ? result.data.items.map(normalizeEnrichedShoppingListItem)
    : (() => {
        const looseItems = Array.isArray(parsed?.items) ? parsed.items : [];
        const normalized: EnrichedShoppingListItem[] = [];
        for (const item of looseItems) {
          const parsedItem = enrichedShoppingListItemSchema.safeParse(item);
          if (parsedItem.success) normalized.push(normalizeEnrichedShoppingListItem(parsedItem.data));
        }
        return normalized;
      })();

  if (!items.length) {
    throw result.success ? new Error('Model returned no shopping list items') : result.error;
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = expectedIds.map((id) => {
    const item = byId.get(id);
    if (!item) {
      throw new Error(`Model returned ${byId.size} of ${expectedIds.length} shopping list items`);
    }
    return item;
  });

  return {
    intro:
      (result.success ? result.data.intro?.trim() : parsed?.intro?.trim()) ||
      'Here is a grocery-friendly version of your planned foods.',
    items: ordered
  };
}

function mockGroceryDescription(item: ShoppingListInputItem, storeName: string | null): EnrichedShoppingListItem {
  const lower = item.name.toLowerCase();
  const groceryDescription = formatGroceryDescription(item.name, item.quantity, item.unit);
  let groceryCategory = 'Other';
  let storeLocation: string | null = null;
  let notes: string | null = null;

  if (/egg|milk|yogurt|cheese|butter|cream/.test(lower)) {
    groceryCategory = 'Dairy & Eggs';
    storeLocation = storeName ? 'Dairy / Aisle 16' : null;
  } else if (/chicken|turkey|beef|steak|salmon|fish|shrimp|pork|sausage|bacon|ground/.test(lower)) {
    groceryCategory = 'Meat & Seafood';
    storeLocation = storeName ? 'Meat & Seafood counter' : null;
  } else if (/rice|oats|pasta|quinoa|bean|lentil|flour|sugar|cereal/.test(lower)) {
    groceryCategory = 'Pantry';
    storeLocation = storeName ? 'Pantry / Aisle 4' : null;
  } else if (/spinach|lettuce|broccoli|asparagus|pepper|tomato|onion|garlic|avocado|banana|apple|berry|fruit|veget|carrot|celery|zucchini|mushroom|cucumber/.test(lower)) {
    groceryCategory = 'Produce';
    storeLocation = storeName ? 'Produce section' : null;
  } else if (/bread|tortilla|wrap|bun/.test(lower)) {
    groceryCategory = 'Bakery';
    storeLocation = storeName ? 'Bakery / Aisle 2' : null;
  } else if (/juice|water|broth|stock|coffee|tea|wine|vinegar|oil|sauce|dressing|beverage|drink|soda|beer|smoothie/.test(lower)) {
    groceryCategory = 'Beverages';
    storeLocation = storeName ? 'Beverages / Aisle 8' : null;
  }

  return {
    id: item.id,
    groceryDescription,
    groceryCategory,
    storeLocation,
    notes
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export class MockAiProvider implements AiProvider {
  async lookupFood(input: string): Promise<FoodEstimate[]> {
    const lines = splitFoodLines(input);
    const items = lines.length ? lines : [input.trim()];
    return items.map((line) => {
      const lower = line.toLowerCase();
      const protein = lower.includes('chicken') ? 42 : lower.includes('egg') ? 18 : lower.includes('almond') ? 30 : 24;
      const carbs = lower.includes('rice') ? 45 : lower.includes('banana') ? 27 : lower.includes('corn') ? 15 : 20;
      const fat = lower.includes('salmon') ? 14 : lower.includes('avocado') ? 18 : lower.includes('almond') ? 72 : 6;
      return {
        normalizedFoodName: line.replace(/\s+/g, ' '),
        calories: Math.round(protein * 4 + carbs * 4 + fat * 9),
        protein,
        carbs,
        fat,
        confidence: 0.72
      };
    });
  }

  async lookupFoodFromImage(_image: { data: string; mimeType: string }, input = 'uploaded meal photo'): Promise<FoodEstimate[]> {
    return this.lookupFood(input || 'uploaded meal photo');
  }

  async lookupExercises(input: string): Promise<ExerciseEstimate[]> {
    const query = input.trim();
    const lower = query.toLowerCase();
    if (lower.includes('bicep') || lower.includes('biceps')) {
      return [
        {
          name: 'Dumbbell Bicep Curl',
          description: 'Stand tall with dumbbells at your sides. Curl up without swinging, then lower under control.',
          category: 'Strength',
          bodyPart: 'Biceps',
          defaultSets: 3,
          defaultReps: 10,
          defaultDurationMinutes: null,
          confidence: 0.84
        },
        {
          name: 'Hammer Curl',
          description: 'Hold dumbbells with neutral palms facing in. Curl while keeping elbows close to your ribs.',
          category: 'Strength',
          bodyPart: 'Biceps',
          defaultSets: 3,
          defaultReps: 10,
          defaultDurationMinutes: null,
          confidence: 0.82
        },
        {
          name: 'Cable Curl',
          description: 'Use a low cable handle and curl with steady tension. Avoid leaning back at the top.',
          category: 'Strength',
          bodyPart: 'Biceps',
          defaultSets: 3,
          defaultReps: 12,
          defaultDurationMinutes: null,
          confidence: 0.8
        }
      ];
    }

    if (lower.includes('abs') || lower.includes('core')) {
      return [
        {
          name: 'Plank',
          description: 'Hold a straight line from head to heels with ribs down and glutes engaged.',
          category: 'Strength',
          bodyPart: 'Core',
          defaultSets: 3,
          defaultReps: null,
          defaultDurationMinutes: 1,
          confidence: 0.86
        },
        {
          name: 'Dead Bug',
          description: 'Press your lower back into the floor while extending opposite arm and leg slowly.',
          category: 'Strength',
          bodyPart: 'Core',
          defaultSets: 3,
          defaultReps: 10,
          defaultDurationMinutes: null,
          confidence: 0.84
        },
        {
          name: 'Bicycle Crunch',
          description: 'Rotate through the ribs and bring elbow to knee without pulling on your neck.',
          category: 'Strength',
          bodyPart: 'Core',
          defaultSets: 3,
          defaultReps: 20,
          defaultDurationMinutes: null,
          confidence: 0.82
        },
        {
          name: 'Hollow Body Hold',
          description: 'Lower back stays glued to the floor while arms and legs hover in a tight hollow shape.',
          category: 'Strength',
          bodyPart: 'Core',
          defaultSets: 3,
          defaultReps: null,
          defaultDurationMinutes: 1,
          confidence: 0.8
        }
      ];
    }

    return [
      {
        name: query.replace(/\s+/g, ' ').slice(0, 60) || 'Custom exercise',
        description: 'Perform with controlled form, full range of motion, and steady breathing throughout each rep.',
        category: 'Strength',
        bodyPart: null,
        defaultSets: 3,
        defaultReps: 10,
        defaultDurationMinutes: null,
        confidence: 0.65
      }
    ];
  }

  async suggestMealOptions(input: string, _context: string): Promise<MealSuggestionResult> {
    const lower = input.toLowerCase();
    const options: MealSuggestion[] = [];
    if (lower.includes('chipotle')) {
      options.push(
        {
          name: 'Chicken bowl with fajita veggies',
          description: 'Chicken, fajita veggies, tomato salsa, lettuce, and a light scoop of rice.',
          calories: 460,
          protein: 38,
          carbs: 45,
          fat: 13
        },
        {
          name: 'Chipotle steak salad bowl',
          description: 'Steak over lettuce with fajita veggies, tomato salsa, and a small amount of beans.',
          calories: 390,
          protein: 35,
          carbs: 32,
          fat: 12
        }
      );
    }
    if (lower.includes('jersey mike') || lower.includes('jersey mikes') || lower.includes("jersey mike's")) {
      options.push(
        {
          name: 'Jersey Mike\'s turkey mini',
          description: 'Mini turkey sub Mike\'s Way. Keep cheese and mayo light if you want fats lower.',
          calories: 470,
          protein: 27,
          carbs: 48,
          fat: 18
        },
        {
          name: 'Jersey Mike\'s chicken bowl',
          description: 'Grilled chicken in a bowl with vegetables and vinegar-based flavor. Skip heavy sauces.',
          calories: 420,
          protein: 38,
          carbs: 20,
          fat: 18
        }
      );
    }
    options.push(
      {
        name: 'Lean protein bowl',
        description: 'Choose grilled protein, vegetables, salsa or light sauce, and a moderate starch portion.',
        calories: 450,
        protein: 35,
        carbs: 40,
        fat: 12
      },
      {
        name: 'Protein-forward salad',
        description: 'Start with greens, add grilled protein, keep dressing on the side, and add one carb if needed.',
        calories: 380,
        protein: 34,
        carbs: 24,
        fat: 14
      },
      {
        name: 'Simple plate option',
        description: 'Order lean protein plus vegetables, then add rice, potatoes, or bread only to match remaining carbs.',
        calories: 500,
        protein: 40,
        carbs: 45,
        fat: 15
      }
    );
    const uniqueOptions = Array.from(new Map(options.map((option) => [option.name, option])).values()).slice(0, 3);
    return {
      intro:
        uniqueOptions.length > 1
          ? 'Good call planning ahead. I would keep this protein-forward and pick the option that best matches how hungry you are.'
          : 'Good call planning ahead. Here is a simple option that should keep lunch close to your targets.',
      options: uniqueOptions
    };
  }

  async enrichShoppingList(items: ShoppingListInputItem[], storeName: string | null = null): Promise<EnrichedShoppingListResult> {
    const intro = storeName
      ? `Grocery list with approximate ${storeName} aisle hints. Layouts vary by location.`
      : 'Grocery-friendly amounts based on your planned foods.';
    return {
      intro,
      items: items.map((item) => mockGroceryDescription(item, storeName))
    };
  }

  async chat(messages: ChatMessage[], context: string, channel: ChatChannel = 'web'): Promise<string> {
    const last = messages.at(-1)?.content.toLowerCase() ?? '';
    const suffix = channel === 'sms' ? ' (mock SMS — set AI_PROVIDER=gemini.)' : ' (mock — set AI_PROVIDER=gemini.)';
    if (last.includes('meal')) return `Based on your program data: ${context.slice(0, 180)}…${suffix}`;
    if (last.includes('calorie')) return `Calorie guidance uses your live targets.${suffix}`;
    return `AI assistant is in mock mode. Set AI_PROVIDER=gemini and GEMINI_API_KEY in server/.env.${suffix}`;
  }

  async classifyNutritionIntent(message: string): Promise<NutritionIntent> {
    const text = message.toLowerCase().trim();
    if (/\b(ate|had|grabbed|finished|devoured|demolished|chowed|scarfed)\b/.test(text)) return 'LOG';
    if (text.endsWith('?') || /\b(what|where|which|should|suggest|recommend|options?|ideas?)\b/.test(text)) return 'SUGGEST';
    return 'CHAT';
  }
}

function wrapAiError(error: unknown, action: string): Error {
  if (error instanceof z.ZodError) {
    const detail = error.issues[0]?.message ?? 'Invalid AI response';
    return new Error(`AI ${action} failed: ${detail}`);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('404 Not Found') && message.includes('model')) {
    return new Error(`Gemini model "${env.GEMINI_MODEL}" is unavailable. Set GEMINI_MODEL=gemini-2.5-flash in server/.env and restart the API.`);
  }
  if (message.includes('API key not valid') || message.includes('API_KEY_INVALID')) {
    return new Error('Gemini API key is invalid. Check GEMINI_API_KEY in server/.env.');
  }
  if (message.includes('429') || message.toLowerCase().includes('quota')) {
    return new Error('Gemini API quota exceeded. Check billing in Google AI Studio.');
  }
  return new Error(`AI ${action} failed: ${message}`);
}

class GeminiAiProvider implements AiProvider {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model;
  }

  private foodModel() {
    return this.client.getGenerativeModel({
      model: this.model,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    });
  }

  private exerciseModel() {
    return this.client.getGenerativeModel({
      model: this.model,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 4096
      }
    });
  }

  private chatModel() {
    return this.client.getGenerativeModel({
      model: this.model,
      generationConfig: { temperature: 0.6, maxOutputTokens: 1024 }
    });
  }

  async lookupFood(input: string): Promise<FoodEstimate[]> {
    const lines = splitFoodLines(input);
    const prompt = lines.length > 1
      ? `${FOOD_LOOKUP_PROMPT}\n\nFoods (${lines.length} items, one JSON entry each):\n${lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}`
      : `${FOOD_LOOKUP_PROMPT}\n\nFood: ${input.trim()}`;

    try {
      const result = await this.foodModel().generateContent(prompt);
      return parseFoodLookupResponse(result.response.text());
    } catch (error) {
      try {
        const retry = await this.foodModel().generateContent(
          `${prompt}\n\nImportant: respond with valid JSON and at least one food item for every requested food.`
        );
        return parseFoodLookupResponse(retry.response.text());
      } catch (retryError) {
        throw wrapAiError(retryError, 'food lookup');
      }
    }
  }

  async lookupFoodFromImage(image: { data: string; mimeType: string }, input = ''): Promise<FoodEstimate[]> {
    const prompt = `${FOOD_LOOKUP_PROMPT}

Estimate the visible food in this image. Use the optional user note only as context; do not invent foods that are not visible.
Optional user note: ${input.trim() || 'none'}`;

    try {
      const result = await this.foodModel().generateContent([
        { text: prompt },
        { inlineData: { mimeType: image.mimeType, data: image.data } }
      ]);
      return parseFoodLookupResponse(result.response.text());
    } catch (error) {
      try {
        const retry = await this.foodModel().generateContent([
          { text: `${prompt}\n\nImportant: respond with valid JSON and at least one food item for the visible food.` },
          { inlineData: { mimeType: image.mimeType, data: image.data } }
        ]);
        return parseFoodLookupResponse(retry.response.text());
      } catch (retryError) {
        throw wrapAiError(retryError, 'food photo lookup');
      }
    }
  }

  async lookupExercises(input: string): Promise<ExerciseEstimate[]> {
    const query = input.trim();
    const prompt = `${EXERCISE_LOOKUP_PROMPT}\n\nUser query: ${query}`;

    try {
      const result = await this.exerciseModel().generateContent(prompt);
      return parseExerciseLookupResponse(result.response.text());
    } catch (error) {
      try {
        const retry = await this.exerciseModel().generateContent(
          `${prompt}\n\nImportant: respond with valid JSON only and no more than 4 items.`
        );
        return parseExerciseLookupResponse(retry.response.text());
      } catch {
        try {
          return await new MockAiProvider().lookupExercises(query);
        } catch {
          throw wrapAiError(error, 'exercise lookup');
        }
      }
    }
  }

  async suggestMealOptions(input: string, context: string): Promise<MealSuggestionResult> {
    const prompt = `${MEAL_SUGGESTION_PROMPT}

Macro context:
${context}

User request:
${input.trim()}`;

    try {
      const result = await withTimeout(this.foodModel().generateContent(prompt), MEAL_SUGGESTION_TIMEOUT_MS, 'Meal suggestions');
      return parseMealSuggestionResponse(result.response.text());
    } catch (error) {
      try {
        const retry = await withTimeout(
          this.foodModel().generateContent(`${prompt}\n\nImportant: respond with valid JSON only and include exactly 3 options.`),
          MEAL_SUGGESTION_TIMEOUT_MS,
          'Meal suggestion retry'
        );
        return parseMealSuggestionResponse(retry.response.text());
      } catch {
        try {
          return await new MockAiProvider().suggestMealOptions(input, context);
        } catch {
          throw wrapAiError(error, 'meal suggestions');
        }
      }
    }
  }

  async enrichShoppingList(items: ShoppingListInputItem[], storeName: string | null = null): Promise<EnrichedShoppingListResult> {
    const expectedIds = items.map((item) => item.id);
    const storeLine = storeName ? `Store: ${storeName}` : 'Store: not specified';
    const prompt = `${SHOPPING_LIST_PROMPT}

${storeLine}

Planned items JSON:
${JSON.stringify(items)}`;

    try {
      const result = await withTimeout(this.foodModel().generateContent(prompt), SHOPPING_LIST_TIMEOUT_MS, 'Shopping list');
      return parseEnrichedShoppingListResponse(result.response.text(), expectedIds);
    } catch (error) {
      try {
        const retry = await withTimeout(
          this.foodModel().generateContent(`${prompt}\n\nImportant: respond with valid JSON only and include every input id exactly once.`),
          SHOPPING_LIST_TIMEOUT_MS,
          'Shopping list retry'
        );
        return parseEnrichedShoppingListResponse(retry.response.text(), expectedIds);
      } catch (retryError) {
        throw wrapAiError(retryError, 'shopping list');
      }
    }
  }

  async chat(messages: ChatMessage[], context: string, channel: ChatChannel = 'web'): Promise<string> {
    try {
      const channelInstruction = channel === 'sms' ? `\n\n${SMS_ASSISTANT_ADDENDUM}` : '';
      const contextTurn = [
        { role: 'user' as const, parts: [{ text: `Program data (JSON):\n${context}` }] },
        { role: 'model' as const, parts: [{ text: 'Understood. I will answer using this program data.' }] }
      ];
      const history = [
        ...contextTurn,
        ...messages.slice(0, -1).map((message) => ({
          role: message.role === 'assistant' ? ('model' as const) : ('user' as const),
          parts: [{ text: message.content }]
        }))
      ];
      const last = messages.at(-1);
      if (!last) throw new Error('Message required');

      const chat = this.chatModel().startChat({
        history,
        systemInstruction: {
          role: 'user',
          parts: [{ text: `${ASSISTANT_SYSTEM}${channelInstruction}` }]
        }
      });
      const result = await chat.sendMessage(last.content);
      return result.response.text().trim();
    } catch (error) {
      throw wrapAiError(error, 'chat');
    }
  }

  async classifyNutritionIntent(message: string): Promise<NutritionIntent> {
    const prompt = `${CLASSIFY_INTENT_PROMPT}\n\nMessage: ${message.trim()}`;
    try {
      const result = await withTimeout(
        this.foodModel().generateContent(prompt),
        CLASSIFY_INTENT_TIMEOUT_MS,
        'Intent classification'
      );
      const parsed = classifyIntentSchema.safeParse(parseModelJson(result.response.text()));
      if (parsed.success) return parsed.data.intent;
      return new MockAiProvider().classifyNutritionIntent(message);
    } catch {
      return new MockAiProvider().classifyNutritionIntent(message);
    }
  }
}

function roundMacro(value: number) {
  return Math.round(value * 10) / 10;
}

function roundConfidence(value: number) {
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

let cachedProvider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (cachedProvider) return cachedProvider;

  if (env.AI_PROVIDER === 'gemini' && env.GEMINI_API_KEY) {
    cachedProvider = new GeminiAiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL);
    return cachedProvider;
  }

  cachedProvider = new MockAiProvider();
  return cachedProvider;
}
