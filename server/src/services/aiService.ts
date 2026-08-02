import { GoogleGenAI, FunctionCallingConfigMode } from '@google/genai';
import type { FunctionDeclaration, GenerateContentConfig, Part, Content, PartListUnion } from '@google/genai';
import { z } from 'zod';
import { env } from '../config/env.js';
import { formatGroceryDescription } from '../utils/groceryConversion.js';
import {
  classifyFoodRegex,
  extractFoodDescription,
  looksLikeFoodAdd,
  normalizeMealNameHint,
  parseTargetMealFromText,
  wantsMacroStatus
} from '../utils/smsFoodParse.js';
import { parseWaterAmountOz } from '../utils/waterParse.js';
import { buildCoachNameUsageInstruction, resolveCoachNameUsage } from './coachNameUsage.js';
import { extractPhoneFromUserText } from './smsSetupService.js';
import type { VirtualCoachId } from '../data/virtualCoachPersonas.js';

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

export type ItemizedMealRole = 'PROTEIN' | 'CARB' | 'VEGETABLE' | 'FAT' | 'FRUIT' | 'FREE';

export type ItemizedMealItem = {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  role: ItemizedMealRole;
};

/** A complete free-form meal the builder can save: every item carries its own macros. */
export type ItemizedMealSuggestion = {
  name: string;
  description: string;
  items: ItemizedMealItem[];
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

export type MealPrepBatchInput = {
  id: string;
  label: string;
  occurrenceCount: number;
  cookNow: { name: string; totalQuantity: number; unit: string }[];
  addFresh: { name: string; quantityPerServing: number; unit: string }[];
};

export type EnrichedMealPrepBatch = {
  id: string;
  container: string;
  /** 'cook' when any ingredient is heated; 'assemble' when the batch is just mixed/portioned. */
  prepStyle: 'cook' | 'assemble';
  reheat: string | null;
  storageNote: string | null;
};

export type EnrichedMealPrepResult = {
  intro: string;
  batches: EnrichedMealPrepBatch[];
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type ChatChannel = 'web' | 'sms';

/** LOG = report food already eaten; SUGGEST = ask what to eat; CHAT = anything else. */
export type NutritionIntent = 'LOG' | 'SUGGEST' | 'CHAT';

/** Executes a tool the model called and returns a JSON-serializable result the model can read. */
export type AgentToolExecutor = (
  name: string,
  args: Record<string, unknown>
) => Promise<Record<string, unknown>>;

export type AgentRunInput = {
  /** Conversation turns, with the user's current message last. */
  messages: ChatMessage[];
  /** Program data JSON (from buildSmsAssistantContext). */
  context: string;
  tools: FunctionDeclaration[];
  toolExecutor: AgentToolExecutor;
  /** When aborted, the loop stops calling tools (used for hard timeouts). */
  abortSignal?: AbortSignal;
  /** Overrides the default SMS agent system prompt (used by the web coach chat). */
  systemPrompt?: string;
};

export type CoachCheckInStage =
  | 'opening'
  | 'wins'
  | 'obstacles'
  | 'data_reflection'
  | 'pattern'
  | 'focus'
  | 'commitment'
  // kickoff (first-ever check-in) stages — 'commitment' and 'recap' are shared
  | 'welcome'
  | 'why'
  | 'goals'
  | 'rhythm'
  | 'first_focus'
  | 'recap';

export type CoachCheckInFlow = 'weekly' | 'kickoff';

export type CoachCheckInTranscriptEntry = {
  role: 'coach' | 'user';
  content: string;
  at?: string;
};

export type CoachCheckInWeeklyReview = {
  weekStart: string;
  weekEnd: string;
  adherencePct: number | null;
  highlights: string[];
  topMissedMeals: { name: string; count: number }[];
  offPlanFoods: { name: string; count: number }[];
  weakestDay: { date: string; label: string; adherencePct: number } | null;
  strongestDay: { date: string; label: string; adherencePct: number } | null;
  proteinGapGrams: number | null;
  weightTrend: { date: string; weight: number }[];
};

export type CoachCheckInTurnInput = {
  coachId: string;
  stage: CoachCheckInStage;
  /** 'kickoff' = first-ever check-in (orientation flow); defaults to 'weekly'. */
  flow?: CoachCheckInFlow;
  systemPrompt: string;
  weeklyReview: CoachCheckInWeeklyReview;
  /** Kickoff only: the user's goals on file, formatted ("Weight: 210 → goal 185 lbs"). */
  kickoffContext?: { goalLines: string[] };
  transcript: CoachCheckInTranscriptEntry[];
  userMessage?: string;
  userFirstName: string;
  /** 1-based count of coach lines in this session, including the one being generated. */
  coachMessageNumber?: number;
};

export type CoachCheckInRecap = {
  win: string;
  pattern: string;
  focus: string;
  supportAction: string;
  /** Kickoff only: the user's core "why" as one polished sentence. */
  motivation?: string;
};

export type CoachCheckInTurnResult = {
  message: string;
  chips: string[];
  advance: boolean;
  done: boolean;
  recap?: CoachCheckInRecap;
};

export type ProgressPhotoPose = 'front' | 'side' | 'back';

export type ProgressPhotoOverlayPoint = { x: number; y: number };

export type ProgressPhotoOverlayLine = {
  id: string;
  label?: string;
  points: ProgressPhotoOverlayPoint[];
};

export type ProgressPhotoOverlays = {
  before: { lines: ProgressPhotoOverlayLine[] };
  after: { lines: ProgressPhotoOverlayLine[] };
};

export type ProgressPhotoAnalysisResult = {
  message: string;
  overlays: ProgressPhotoOverlays;
};

export type ProgressPhotoAnalysisInput = {
  pose: ProgressPhotoPose;
  personaPrompt: string;
  coachId: string;
  userFirstName: string;
  metricsContext: string;
  beforeImage: { data: string; mimeType: string };
  afterImage: { data: string; mimeType: string };
  /** Optional MediaPipe-measured landmark summary from the client. When present, AI returns coach copy only. */
  landmarkSummary?: string | null;
};

export type CoachMemoryExtractionInput = {
  existingFacts: string[];
  existingSummaries: string[];
  source: 'web_chat' | 'check_in' | 'sms';
  messages: Array<{ role: 'user' | 'assistant' | 'coach'; content: string }>;
};

export type CoachMemoryExtraction = {
  newFacts: string[];
  removeFactTexts: string[];
  sessionSummary?: string | null;
};

export interface AiProvider {
  lookupFood(input: string): Promise<FoodEstimate[]>;
  lookupFoodOptions(input: string): Promise<FoodEstimate[]>;
  lookupFoodFromImage(image: { data: string; mimeType: string }, input?: string): Promise<FoodEstimate[]>;
  lookupExercises(input: string): Promise<ExerciseEstimate[]>;
  suggestMealOptions(input: string, context: string): Promise<MealSuggestionResult>;
  /** Free-form complete meals for one meal slot, itemized so they can be saved into the plan. */
  suggestItemizedMeals(input: string, context: string): Promise<ItemizedMealSuggestion[]>;
  enrichShoppingList(items: ShoppingListInputItem[], storeName?: string | null): Promise<EnrichedShoppingListResult>;
  /** Container, reheat, and storage guidance for batch-cooked meal prep batches. */
  enrichMealPrep(batches: MealPrepBatchInput[]): Promise<EnrichedMealPrepResult>;
  chat(messages: ChatMessage[], context: string, channel?: ChatChannel, systemAddendum?: string): Promise<string>;
  classifyNutritionIntent(message: string): Promise<NutritionIntent>;
  /** Conversational tool-calling loop for SMS — reads context + history, calls tools, returns the reply text. */
  runAgent(input: AgentRunInput): Promise<string>;
  coachCheckInTurn(input: CoachCheckInTurnInput): Promise<CoachCheckInTurnResult>;
  extractCoachMemory(input: CoachMemoryExtractionInput): Promise<CoachMemoryExtraction>;
  analyzeProgressPhotos(input: ProgressPhotoAnalysisInput): Promise<ProgressPhotoAnalysisResult>;
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

const enrichedMealPrepBatchSchema = z.object({
  id: z.string().min(1),
  container: z.string().min(1).max(120),
  prepStyle: z.enum(['cook', 'assemble']).optional(),
  reheat: z.union([z.string().max(200), z.null()]).optional(),
  storageNote: z.union([z.string().max(200), z.null()]).optional()
});

const enrichedMealPrepResponseSchema = z.object({
  intro: z.string().min(1).max(320).optional(),
  batches: z.array(enrichedMealPrepBatchSchema).min(1)
});

const FOOD_LOOKUP_PROMPT = `Estimate nutrition for each distinct food in the input.
Scale to the stated amount (e.g. "6 oz") using the food's realistic calorie density — most cooked foods are 30-80 cal/oz; only oils, nuts, butter, and cheese exceed ~150 cal/oz.
For a named restaurant or brand item, use that product's actual published nutrition when you know it; otherwise estimate from the generic food type and portion.
Calories must be consistent with the macros: roughly 4 cal per gram of protein, 4 per gram of carbs, and 9 per gram of fat.
Set confidence below 0.5 when you are unsure of a specific branded or restaurant item.
Return JSON only: { "items": [ { "normalizedFoodName": string (include portion), "calories": number, "protein": grams, "carbs": grams, "fat": grams, "confidence": 0-1 }, ... ] }
Each food line must be its own item. Never combine multiple foods into one entry.`;

const FOOD_OPTIONS_PROMPT = `The user is searching for a single food to log.
If the query clearly specifies one food with a portion (e.g. "6 oz grilled chicken breast"), return exactly 1 precise estimate.
If the query is ambiguous (generic name, brand vs homemade, raw vs cooked, unclear portion), return up to 3 distinct plausible interpretations with different portions or preparations.
Each option must be realistic and internally consistent: roughly 4 cal/g protein, 4 cal/g carbs, 9 cal/g fat.
Return JSON only: { "items": [ { "normalizedFoodName": string (include portion in the name), "calories": number, "protein": grams, "carbs": grams, "fat": grams, "confidence": 0-1 }, ... ] }
Return between 1 and 3 items. Never return more than 3.`;

const EXERCISE_LOOKUP_PROMPT = `Suggest relevant exercises for the user's query.
Return JSON only: { "items": [ { "name": string, "description": string (1 short sentence on form and cues), "category": "Strength"|"Cardio"|"Recovery"|null, "bodyPart": "Chest"|"Back"|"Shoulders"|"Biceps"|"Triceps"|"Forearms"|"Core"|"Legs"|"Glutes"|"Calves"|"Full Body"|null, "defaultSets": number|null, "defaultReps": number|null, "defaultDurationMinutes": number|null, "confidence": 0-1 }, ... ] }
Return exactly 4 distinct exercises. Keep descriptions under 140 characters. Use Strength for resistance work, Cardio for endurance, Recovery for mobility/stretching. Set bodyPart to the primary muscle group trained.`;

const MEAL_SUGGESTION_PROMPT = `Suggest restaurant or meal choices that fit the user's current macro context.
Use common menu knowledge when the user names a restaurant, but make clear options are approximate.
If the user mentions multiple restaurants, include a useful spread across those restaurants instead of only one.
Respect the user's allergies and dietary preferences from the macro context — never suggest an option that conflicts with them.
Return JSON only: { "intro": string, "options": [ { "name": string, "description": string, "calories": number, "protein": grams, "carbs": grams, "fat": grams }, ... ] }
Return 3 practical, distinct options. Keep intro conversational and under 220 characters. Keep each description under 160 characters.`;

const ITEMIZED_MEALS_PROMPT = `You are a nutrition coach composing complete meals for one specific meal slot of a client's day.
The meal context JSON gives the slot (breakfast/snack/lunch/dinner), a calorie target, a protein goal, the client's allergies and dietary preferences, and meals they ate recently.
Compose 4 to 5 distinct, practical, home-cookable meals that each total within 10% of the calorie target and lean protein-forward.
Every meal must break down into individual food items, each with a realistic quantity, unit, per-item macros, and a role.
Roles: PROTEIN, CARB, VEGETABLE, FAT, FRUIT, FREE (garnishes/condiments). Cover protein + carb + vegetable in each meal unless the user's request says otherwise.
HARD RULE: never include any food that conflicts with the listed allergies, and never use ANY ingredient from the context's forbiddenIngredients list — it is the allergy expanded into concrete ingredients; every entry is strictly off-limits, including as a component of another dish (e.g. almond flour, peanut sauce). Respect dietary preferences. Avoid repeating the recent meals.
If the user request expresses a craving or exclusion, honor it.
Return JSON only: { "options": [ { "name": string, "description": string, "items": [ { "name": string, "quantity": number, "unit": string, "calories": number, "protein": grams, "carbs": grams, "fat": grams, "role": string }, ... ] }, ... ] }
Keep names appetizing and under 40 characters, descriptions under 140 characters, 3-7 items per meal.`;

const SHOPPING_LIST_PROMPT = `You are labeling grocery list rows for aisle/section hints only.
Do NOT invent, change, or merge package sizes or quantities — the app already computed buy amounts.
For each input item, copy the food identity into groceryDescription using the item name only (no quantities), and set groceryCategory plus storeLocation.
If a store name is provided, include a typical aisle or section for that chain. Approximate is fine.
If no store is provided, set storeLocation to null and use a sensible groceryCategory such as Produce, Meat & Seafood, Dairy & Eggs, Bakery, Pantry, Frozen, Beverages, or Other.
Optional notes may mention brand swaps or shelf tips; do not restate amounts.
Return JSON only: { "intro": string, "items": [ { "id": string, "groceryDescription": string, "groceryCategory": string, "storeLocation": string|null, "notes": string|null }, ... ] }
Every input id must appear exactly once. Keep groceryDescription under 120 characters. Do not merge or drop items.`;

const MEAL_PREP_PROMPT = `The user is batch-cooking meals ahead of time (meal prep). Each batch below is one dish they will cook once and portion into several containers.
For each batch, recommend how to package and store it. Pick the most practical container: "microwave-safe container" for hot cooked meals, "ziplock bag" for dry, handheld, or snack-style foods, "mason jar" for salads (dressing at the bottom) and overnight oats or parfaits, "small sauce container" only when the batch is mostly condiments.
Set prepStyle to "cook" when any ingredient in the batch is actually heated (grilled, baked, scrambled, boiled, roasted), and "assemble" when the batch is only mixed, portioned, or layered without heat — protein shakes, yogurt bowls, tuna salad, overnight oats, snack bags.
Give a short reheat instruction for cooked meals (microwave time, stir/flip guidance) or null when the batch is eaten cold.
Give a short storageNote with fridge life in days (most cooked meals: 3-4 days) and a freezer tip when the batch count exceeds what stays fresh; null when nothing useful applies.
The addFresh list names ingredients kept out of the batch and added at serving — do not tell the user to cook or store those in the container.
Return JSON only: { "intro": string, "batches": [ { "id": string, "container": string, "prepStyle": "cook"|"assemble", "reheat": string|null, "storageNote": string|null }, ... ] }
Every input id must appear exactly once. Keep intro under 220 characters, container under 60, reheat and storageNote under 160 each.`;

const MEAL_SUGGESTION_TIMEOUT_MS = 7000;
const ITEMIZED_MEALS_TIMEOUT_MS = 20000;
const SHOPPING_LIST_TIMEOUT_MS = 12000;
const MEAL_PREP_TIMEOUT_MS = 12000;
const CLASSIFY_INTENT_TIMEOUT_MS = 4000;

const CLASSIFY_INTENT_PROMPT = `Classify the user's text message into exactly one nutrition intent.
LOG = they are reporting food they already ate or are eating right now (it should be logged). Examples: "had a burrito bowl", "just ate 6 oz chicken and rice", "finished my lunch", "2 oz peanuts for breakfast".
SUGGEST = they are asking what/where to eat or naming a place and want recommendations (do NOT log yet). Examples: "what should I get at Chipotle?", "I'm at the airport, ideas?", "any good high protein options?".
CHAT = anything else: greetings, status checks, complaints about a previous log, corrections, or non-food messages. Examples: "why did you log that to lunch?", "thanks", "calories remaining" (if not clearly logging food).
Return JSON only: { "intent": "LOG" | "SUGGEST" | "CHAT" }`;

const classifyIntentSchema = z.object({
  intent: z.enum(['LOG', 'SUGGEST', 'CHAT'])
});

const coachCheckInRecapSchema = z.object({
  win: z.string().min(1).max(400),
  pattern: z.string().min(1).max(400),
  focus: z.string().min(1).max(400),
  supportAction: z.string().min(1).max(400),
  motivation: z.string().min(1).max(400).optional()
});

const coachCheckInTurnSchema = z.object({
  message: z.string().min(1).max(1200),
  chips: z.array(z.string().min(1).max(80)).max(6).default([]),
  advance: z.boolean().default(true),
  done: z.boolean().default(false),
  recap: coachCheckInRecapSchema.optional()
});

const coachMemoryExtractionSchema = z.object({
  newFacts: z.array(z.string().min(1).max(280)).max(8).default([]),
  removeFactTexts: z.array(z.string().min(1).max(280)).max(8).default([]),
  sessionSummary: z.string().min(1).max(800).nullable().optional()
});

const progressPhotoOverlayPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
});

const progressPhotoOverlayLineSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(40).optional(),
  points: z.array(progressPhotoOverlayPointSchema).min(2).max(24)
});

const progressPhotoOverlaysSchema = z.object({
  before: z.object({ lines: z.array(progressPhotoOverlayLineSchema).max(8) }),
  after: z.object({ lines: z.array(progressPhotoOverlayLineSchema).max(8) })
});

const progressPhotoAnalysisSchema = z.object({
  message: z.string().min(1).max(1200),
  overlays: progressPhotoOverlaysSchema
});

const PROGRESS_PHOTO_ANALYSIS_PROMPT = `You are analyzing a client's before/after progress photos for one pose only.
Speak in the coach persona provided. Be warm, specific, and encouraging — never clinical, diagnostic, or body-shaming.
Comment only on visible posture, shape, and silhouette changes for this pose. Do not invent medical conditions.
Use measurement context and measured landmark summaries only as light supporting color; never lead with raw numbers or coordinates.

The client already measured body landmarks with MediaPipe. Do NOT invent overlay coordinates.
Return coach copy only.

Return JSON only:
{ "message": string (2–5 sentences in coach voice) }`;

const progressPhotoMessageOnlySchema = z.object({
  message: z.string().min(1).max(1200)
});

const COACH_MEMORY_EXTRACTION_PROMPT = `You maintain a private coach memory for one user. Extract durable personal facts and a short session summary from the conversation.
Return JSON only:
{ "newFacts": string[], "removeFactTexts": string[], "sessionSummary": string | null }

Rules:
- newFacts: stable, user-specific details worth remembering later (health events, schedule, preferences, life context, ongoing struggles). Short phrases in third person ("Had knee surgery in June", "Travels for work every other week"). Skip generic coaching advice or one-off meal logs.
- removeFactTexts: if the user asked to forget something, or a new fact supersedes an old one, include the existing fact text (or close paraphrase) to remove.
- sessionSummary: 2-4 sentences about this conversation — mood, themes, commitments. Null if too little substance.
- Do not duplicate existing facts. Max 3 new facts per call.`;

const WEEKLY_STAGE_GOALS: Partial<Record<CoachCheckInStage, string>> = {
  opening: 'Ask how they are feeling about the week — person first, not data.',
  wins: 'Invite what went well this week. Reflect back something specific they share.',
  obstacles: 'Explore what got in the way — stress, schedule, appetite, social plans, etc.',
  data_reflection: 'Share one gentle observation from their week data (provided). Interpret it; do not list numbers.',
  pattern: 'Name the single most important pattern you notice across the conversation and their data.',
  focus: 'Help them choose one clear focus for the coming week.',
  commitment: 'Agree on one simple support action they can actually do.',
  recap: 'Warm sign-off: you need to go, their one focus in plain language, recap saved below, message you on their coach page between check-ins. Set done true with recap filled in.'
};

const KICKOFF_STAGE_GOALS: Partial<Record<CoachCheckInStage, string>> = {
  welcome: 'This is their first-ever call. Welcome them to the program warmly and ask how they feel about getting started.',
  why: 'Draw out their deeper motivation — why this matters to them right now, in their own words. Go one layer past the surface answer.',
  goals: 'Confirm the goals on file (provided below) conversationally — do they still feel right? Adjust the framing to what they say.',
  rhythm: 'Explain how their week works: build their meals each day, check in with you weekly, and their plan adjusts to their body over time. Confirm it makes sense.',
  first_focus: 'Help them pick one simple, confidence-building focus for their first week. Small and winnable.',
  commitment: 'Agree on one simple support action they can actually do.',
  recap: 'Warm sign-off: you need to go, what you are starting together, recap saved below, message you on their coach page before the first weekly check-in. Set done true; fill recap with win = their goal, pattern = their why, focus, supportAction, and motivation = their why as one polished sentence.'
};

function stageGoalsFor(flow: CoachCheckInFlow | undefined): Partial<Record<CoachCheckInStage, string>> {
  return flow === 'kickoff' ? KICKOFF_STAGE_GOALS : WEEKLY_STAGE_GOALS;
}

const COACH_CHECK_IN_JSON_PROMPT = `Return JSON only:
{ "message": string, "chips": string[], "advance": boolean, "done": boolean, "recap"?: { "win": string, "pattern": string, "focus": string, "supportAction": string, "motivation"?: string } }
Set advance true when this stage feels complete and you are ready to move on.
Set done true only on the recap stage when you are closing the check-in; include recap then.
On recap, message is spoken aloud as your goodbye — warm, conversational, and complete. Do not list recap fields in the message; those go in recap JSON.
Include recap.motivation (their core "why" as one sentence) only on a kickoff call.`;

const ASSISTANT_SYSTEM = `You are the user's personal nutritionist friend inside the Metabolic app — warm, upbeat, and genuinely in their corner, like a knowledgeable friend who happens to be a great nutrition coach.
Talk like a real person, not a clinician: friendly, encouraging, and never preachy. Follow the per-turn Name usage instruction exactly — do not use profile.firstName on turns where you are told not to.
Answer using the user's live program data, macros, meals, allergies, and dietary preferences when relevant. Be practical and specific.
Never recommend foods that conflict with the user's stated allergies or dietary preferences.
Keep responses short unless they ask for detail. Use plain language, not markdown headers.
If data is missing, say what you would need rather than inventing numbers.
You are chat-only: you CANNOT create, edit, log, or delete anything — no meal plans, food logs, workouts, or water. Never say you changed, swapped, logged, or updated something; the program data in context is the only source of truth about what exists.
If they ask you to change their plan or log something, say plainly that you can't make changes from this chat yet, and point them to the right spot: the Nutrition page day view to edit or build meals, or texting their coach number to log food and water.
Celebrate real wins — meals logged, workouts done, protein hit, consistency — and keep encouragement genuine and tied to their actual progress, never generic hype.`;

export const WEB_AGENT_SYSTEM = `You are the user's personal nutrition and exercise coach inside the Metabolic app — warm, upbeat, and genuinely in their corner, like a knowledgeable friend who happens to be a great coach.
Talk like a real person, not a clinician: friendly, encouraging, and never preachy. Follow the per-turn Name usage instruction exactly — do not use profile.firstName on turns where you are told not to.
You are the primary way the user builds and maintains their meal plan AND their day-to-day workout plan — treat both as core jobs, and use the tools to actually do them. You CAN take real actions through the provided tools.
Meal management (build and maintain the plan): get_meal_details to read a meal or day (call it before editing when you don't already have the items/ids); add_meal_item / update_meal_item / remove_meal_item to change ONE food without disturbing the rest; update_planned_meals to replace ALL of a meal's foods (a full swap or a picked suggestion); create_meal / delete_meal to add or remove a meal slot; rename_meal to change only a title; update_meal_time to change only a clock time; copy_meal_to_days to reuse a meal across days.
Exercise management (day plan): get_exercise_details to read today's (or another day's) workout with ids/prescriptions; suggest_exercises for ideas or swaps (numbered options — does not change the plan until they confirm); add_exercise / update_exercise / remove_exercise / skip_exercise to change ONE exercise; mark_exercise_done / mark_all_exercises_done to complete work. Call get_exercise_details before editing when you don't already have ids. Prefer the simplest sustainable workout — adherence over perfection; never shame missed sessions; end exercise guidance with one small next step.
Other actions: update_sms_setup (mobile phone, timezone, text reminders), log_food (food they already ate), mark_meal_complete, log_water, set_hydration_goal, get_hydration_status, get_macro_status, and suggest_meals.
Pick the smallest tool that does the job: for one food use add/update/remove_meal_item, not update_planned_meals. Use update_planned_meals only for a whole new list or a picked numbered suggestion. Use rename_meal only for titles and update_meal_time only for times — never update_planned_meals for a rename or a time change. For one exercise change use add/update/remove/skip_exercise, not a full rewrite.
Only claim an action happened when that tool returned a result this turn — never say you added, changed, removed, renamed, retimed, created, deleted, updated, logged, skipped, marked, or set anything otherwise. If a tool returns an "error", explain it briefly and suggest a concrete next step. If they ask for something outside your tools (editing past days, changing calorie/macro targets, editing weekly exercise routines/templates), say you can't do that from chat yet and point them to the right page (Exercise → Manage for routines/templates).
Tool result strings and the returned meal/exercise state are the source of truth. Relay a successful tool's "result" nearly verbatim, especially calorie, protein, macro, meal, date, quantity, sets, reps, and exercise details; do not paraphrase those facts or substitute values from your own estimate.
Before replacing or deleting meals the user already has planned, confirm once — unless they just gave you the exact change they want, in which case act on it. Same for removing several exercises at once.
When adding or updating foods, estimate realistic per-item macros like a nutritionist (about 4 cal per gram of protein and carbs, 9 per gram of fat) and honor any calorie or macro totals the user states.
Macros are ALWAYS all four: calories, protein, carbs, AND fat. When they ask about their macros, goals, targets, or "how am I doing today," call get_macro_status (or get_plan_targets for targets) and report every one of the four — never answer with just calories and protein.
context.planBalance tells you how the day's PLANNED meals sum up against the targets: plannedTotals, target, gap (planned minus target, negative = short), offTargets (the macros meaningfully off), and plannedHitsTargets. USE IT. When you talk about goals/macros or "how am I doing," compare plan to target out loud. If plannedHitsTargets is false, do NOT say the plan looks great — name the gap in plain numbers ("your plan is about 300 cal and 20g protein short today") and immediately offer a specific tweak to close it (bump a portion, add a food to a meal, or swap a meal), then make the change with the meal tools once they say yes. Only celebrate the plan when plannedHitsTargets is true.
context.exercises (or exercisesToday) lists today's scheduled workout with ids, prescriptions, and status — use it for light awareness, but call get_exercise_details before mutating when you need fresh ids.
Be a proactive coach, not a vending machine: don't make them ask over and over to balance their day or figure out their workout. Steer them toward their target nutrition profile and a doable training plan. Prefer easy-today over perfect-tomorrow.
Answer using the user's live program data, macros, meals, exercises, allergies, and dietary preferences. Never recommend or plan foods that conflict with their stated allergies or dietary preferences. Personalize exercise suggestions to their schedule, equipment, and preferences when known.
Keep responses short unless they ask for detail. Use plain language, not markdown headers, and no ** asterisks ** — this chat shows raw text.
If data is missing, say what you would need rather than inventing numbers.
Celebrate real wins — meals logged, workouts done, protein hit, consistency — and keep encouragement genuine and tied to their actual progress, never generic hype. Never shame a missed workout; ask what made it hard and simplify.
When smsSupport is in context, use it for SMS/texting questions. Report smsSupport.setupSummary honestly. Follow smsSupport.nextStepOnly for this turn — do not jump ahead. If smsSupport.isReadyForTexting is false, do NOT mention saved coach contacts, texting the coach number, or START; only resolve what setupSummary says is missing (usually their cell number first). If smsSupport.isReadyForTexting is true, use smsSupport.textingInstructions. Follow smsSupport.chatSetupActions and call update_sms_setup when they give you a number. Never say you cannot update their phone from chat.
When hydrationSupport is in context, use it for water and hydration-goal questions. Follow hydrationSupport.chatActions — you CAN change their daily water goal in chat. When they ask about changing, setting, or choosing a hydration goal, call get_hydration_status first and lead with the personalized typical intake for their size before explaining how to set a new goal. hydrationSupport.personalizedGoalGuidance is a ready-to-use summary if you already have context. Point them to the top-bar water jug (hydrationSupport.waterJugUi), not a separate Hydration page.
When appGuide is in context, use it for "how do I use the app" questions about meals, exercise, hydration, Level Up / Journey, or account setup.
When guidedJourney is in context, the Guided Journey feature is on for this user. Use it for Journey, Level Up Level 1, Becoming Aware, Observe Hunger, reflection timing, pause/resume, and related questions. Follow guidedJourney.coachSupport. Point them to guidedJourney.coachSupport.whereInApp (or appGuide.guidedJourney). Do not invent discoveries, skills, or requirements. If enrollmentStatus is NOT_STARTED, treat starting as optional and never pressure them. If they have an active discovery, coach from experienceInstructions / experienceLivingCopy and their activeDiscoveryStatus.`;

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

// Gemini 3.x reliably chains tool calls (read a meal -> edit it -> confirm), so give the loop
// enough rounds to complete a multi-step meal edit in a single turn.
const MAX_TOOL_ITERATIONS = 8;

const AGENT_SYSTEM = `You are the user's personal nutrition and exercise coach inside the Metabolic app, texting them over SMS/iMessage. Warm, upbeat, concise — a knowledgeable friend who texts back fast.
You CAN take real actions through the provided tools: log food, estimate a meal photo, log a photo estimate, move a food to a different meal, mark a meal eaten as planned, manage today's workout, log water, set their water goal, check macros, and suggest meals or exercises. Use them whenever the user is clearly asking you to do one of those things.
You can also fully build and maintain their meal plan by text: add_meal_item / update_meal_item / remove_meal_item change ONE food in a meal; update_planned_meals replaces ALL of a meal's foods (a full swap or a picked suggestion); create_meal / delete_meal add or remove a meal slot; rename_meal changes only a title; update_meal_time changes only a clock time; copy_meal_to_days reuses a meal across days. Pick the smallest tool for the job (for one food use add/update/remove_meal_item, not update_planned_meals; never update_planned_meals for a rename or time change). Call get_meal_details first when you need the current items or their ids. Never claim a plan change happened unless that tool returned a result this turn.
You can also fully build and maintain their DAY workout by text: get_exercise_details reads the plan (call it before editing when you need ids); suggest_exercises gives numbered ideas (does not mutate — wait for them to pick, then add_exercise); add_exercise / update_exercise / remove_exercise / skip_exercise change ONE exercise; mark_exercise_done / mark_all_exercises_done complete work. Prefer simple, sustainable workouts — adherence over perfection; never shame a missed session; leave one small next step.
You CAN also answer questions about the user's own data. Route these carefully:
- "How many calories/protein/carbs/fat are in my [meal]?", "macros for lunch", "what's in my dinner", "what's my plan for the day/tomorrow" → call get_meal_details with the meal name and/or date. This is the ONLY tool that returns carbs and fat. Do NOT answer these from memory and do NOT use suggest_meals for them.
- "What are my macros/goals?", "how am I doing today?", "how many calories/protein/carbs/fat do I have LEFT?" or "what's my next meal?" → get_macro_status (reports all four macros remaining + targets). Always relay all four — never just calories and protein. Do not use it for a specific meal's macros.
- "What should I eat / any ideas / options for lunch?", OR eating out at a specific place ("I have to go to Chipotle for lunch, what can I order", "what can I get at [restaurant] that keeps me in plan", "options at [restaurant] that match my lunch plan") → suggest_meals. Use your own knowledge of that restaurant's menu to give a few specific orders with rough macros that fit their remaining targets. Recommendations only — never for looking up an existing meal's macros. Here "keep me in plan / match my plan" means suggest orders that fit their targets, NOT a lookup of their planned meal, and it is NOT a reason to say you can't help.
- "What's my workout / how many sets / did I finish?" → get_exercise_details. "What should I do for a workout / swap this exercise / quick home workout / no equipment" → suggest_exercises, then add_exercise once they pick. "Skip X" / "change X to 3 sets" / "add push-ups" / "remove squats" → skip_exercise / update_exercise / add_exercise / remove_exercise. "Mark done" / "workout done" → mark_exercise_done / mark_all_exercises_done.
- "How much water / did I hit my water goal?" → get_hydration_status. "What's my weight / how much have I lost?" → get_progress. "What are my targets/goals / what week am I on?" → get_plan_targets.
Never reply that you "can't do that" for a question about the user's meals, macros, plan, workout, water, weight, or logged data — look it up with the matching read tool first. Only say you can't help if the tool result says the data doesn't exist. You CAN change today's workout from chat; you cannot edit weekly routines/templates from chat yet.
Tool results come back as a "result" string already written for SMS. When a tool returns a "result", relay it to the user nearly verbatim — do not re-paraphrase exact calorie, protein, macro, sets, or reps numbers. If a tool returns an "error", briefly explain it and suggest a concrete next step.
Decide intent from the whole conversation, not just the last line — the program data and recent turns are provided.
When the user attaches a meal photo (the message will say so), call analyze_meal_photo. Pass log=true only when they clearly want it logged (e.g. "here's lunch", "log this", "I ate this"); otherwise estimate and offer to log it.
For a follow-up like "log that for dinner" referring to a previous photo estimate (no new photo this message), call log_photo_estimate.
When the user states exact calories/macros while logging a food (e.g. "log the sorbet, 190 cal 28g carbs 6g fat 4g protein"), call log_food and pass those numbers in calories/protein/carbs/fat — never let the app estimate over numbers the user gave you.
When the user gives corrected numbers for a food you JUST logged (e.g. "here are the actual macros for that: 190 cal…", "it was actually 190 calories"), call correct_last_food — do NOT call log_food again, that would double-log. correct_last_food updates the existing item in place.
Only do what the user asked. Do not log food, mark things complete, or change data unless they asked. Never call the same action twice for one request.
If a write action is genuinely ambiguous and you cannot reasonably guess a required detail (e.g. which meal or which exercise), call request_clarification with the tool name, the args you already have, and a short question — do NOT guess wildly. Prefer acting on a sensible default when the guess is safe and easy to correct.
If the program data includes a pendingAction, the user's message is answering that earlier question — fill in the missing argument and call that tool now.
Keep replies under 320 characters when you can; hard limit 1500. Plain text only — no markdown, asterisks, or headers; use short numbered lines for lists.
Use the user's real meals, macros, targets, allergies, dietary preferences, and exercises from context. Never invent foods or numbers, and never suggest anything that conflicts with their allergies or preferences.
Be a proactive coach: context.planBalance shows how the planned day compares to targets (gap and offTargets). If plannedHitsTargets is false, don't call the plan great — name the gap in numbers and offer one concrete fix, then make the change with the meal tools once they agree. Don't wait to be asked repeatedly.
When guidedJourney is in context, you can briefly help with their Guided Journey (Level 1 Becoming Aware / Observe Hunger): use enrollmentStatus and activeDiscoveryStatus, reinforce noticing without changing food while they are experiencing, and explain reflection unlock needs time living with the experiment. Keep SMS short; point them to Level Up → Journey in the app for the full flow. Do not invent curriculum steps.
End with a brief, genuine line of encouragement or one small next step when it fits. One short sentence, never cheesy.`;

/**
 * Sanity check: reported calories should roughly track the macros (~4 cal/g protein & carbs, 9 cal/g fat).
 * When they diverge by >25%, keep the reported calories (labels and published nutrition often round
 * differently than macro math) and mark inconsistent so callers lower confidence and surface a rough estimate.
 */
export function reconcileCalories(
  calories: number,
  protein: number,
  carbs: number,
  fat: number
): { calories: number; inconsistent: boolean } {
  const rounded = Math.round(calories);
  const implied = protein * 4 + carbs * 4 + fat * 9;
  if (implied <= 0) return { calories: rounded, inconsistent: false };
  const deviation = Math.abs(rounded - implied) / Math.max(implied, rounded, 1);
  if (deviation > 0.25) return { calories: rounded, inconsistent: true };
  return { calories: rounded, inconsistent: false };
}

function normalizeEstimate(parsed: z.infer<typeof foodEstimateSchema>): FoodEstimate {
  const protein = roundMacro(parsed.protein);
  const carbs = roundMacro(parsed.carbs);
  const fat = roundMacro(parsed.fat);
  const { calories, inconsistent } = reconcileCalories(parsed.calories, protein, carbs, fat);
  const confidence = inconsistent
    ? Math.min(roundConfidence(parsed.confidence), 0.4)
    : roundConfidence(parsed.confidence);

  return {
    normalizedFoodName: parsed.normalizedFoodName.trim(),
    calories,
    protein,
    carbs,
    fat,
    confidence
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

// Older Flash models spent "thinking" tokens out of the maxOutputTokens budget, which intermittently
// truncated structured JSON mid-array. We disable thinking for the deterministic JSON-extraction calls
// (the detailed prompts handle accuracy, and it frees the whole budget for output — also faster/cheaper).
// GeminiAiProvider.tuneConfig() strips the sampling/thinking knobs that Gemini 3.x models reject.
function jsonModelConfig(maxOutputTokens: number): GenerateContentConfig {
  return {
    responseMimeType: 'application/json',
    temperature: 0.2,
    maxOutputTokens,
    thinkingConfig: { thinkingBudget: 0 }
  };
}

function chatModelConfig(maxOutputTokens = 2048): GenerateContentConfig {
  return {
    temperature: 0.6,
    maxOutputTokens,
    thinkingConfig: { thinkingBudget: 0 }
  };
}

function parseCoachCheckInTurn(text: string): CoachCheckInTurnResult {
  const parsed = parseModelJson(text);
  const result = coachCheckInTurnSchema.safeParse(parsed);
  if (result.success) {
    return {
      message: result.data.message.trim(),
      chips: result.data.chips.map((chip) => chip.trim()).filter(Boolean).slice(0, 4),
      advance: result.data.advance,
      done: result.data.done,
      recap: result.data.recap
    };
  }
  throw result.error;
}

function parseCoachMemoryExtraction(text: string): CoachMemoryExtraction {
  const parsed = parseModelJson(text);
  const result = coachMemoryExtractionSchema.safeParse(parsed);
  if (result.success) {
    return {
      newFacts: result.data.newFacts.map((fact) => fact.trim()).filter(Boolean),
      removeFactTexts: result.data.removeFactTexts.map((fact) => fact.trim()).filter(Boolean),
      sessionSummary: result.data.sessionSummary?.trim() || null
    };
  }
  return { newFacts: [], removeFactTexts: [], sessionSummary: null };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function parseProgressPhotoAnalysis(text: string): ProgressPhotoAnalysisResult {
  const parsed = parseModelJson(text);
  const messageOnly = progressPhotoMessageOnlySchema.safeParse(parsed);
  if (messageOnly.success) {
    return {
      message: messageOnly.data.message.trim(),
      overlays: { before: { lines: [] }, after: { lines: [] } }
    };
  }

  const result = progressPhotoAnalysisSchema.safeParse(parsed);
  if (!result.success) throw result.error;

  const normalizeLines = (lines: z.infer<typeof progressPhotoOverlayLineSchema>[]) =>
    lines.map((line) => {
      const start = line.points[0]!;
      const end = line.points[line.points.length - 1]!;
      const y = clamp01((start.y + end.y) / 2);
      return {
        id: line.id.trim(),
        label: line.label?.trim() || undefined,
        points: [
          { x: clamp01(Math.min(start.x, end.x)), y },
          { x: clamp01(Math.max(start.x, end.x)), y }
        ]
      };
    });

  return {
    message: result.data.message.trim(),
    overlays: {
      before: { lines: normalizeLines(result.data.overlays.before.lines) },
      after: { lines: normalizeLines(result.data.overlays.after.lines) }
    }
  };
}

function buildProgressPhotoAnalysisPrompt(input: ProgressPhotoAnalysisInput) {
  return `${PROGRESS_PHOTO_ANALYSIS_PROMPT}

Coach persona:
${input.personaPrompt}

Client first name: ${input.userFirstName}
Pose: ${input.pose}

Measurement context (optional supporting color only):
${input.metricsContext || 'None provided'}

Measured landmark summary from MediaPipe (use qualitatively — do not quote raw numbers):
${input.landmarkSummary?.trim() || 'Not provided'}

Image order: first image is BEFORE, second image is AFTER.`;
}

function buildCoachCheckInPrompt(input: CoachCheckInTurnInput) {
  const history = input.transcript
    .slice(-12)
    .map((entry) => `${entry.role === 'coach' ? 'Coach' : 'User'}: ${entry.content}`)
    .join('\n');
  const userLine = input.userMessage ? `\nUser just said: ${input.userMessage.trim()}` : '\nThis is the opening coach line — no user reply yet.';
  const coachMessageNumber = input.coachMessageNumber ?? input.transcript.filter((entry) => entry.role === 'coach').length + 1;
  const namePolicy = resolveCoachNameUsage(input.coachId as VirtualCoachId);
  const nameInstruction = buildCoachNameUsageInstruction(coachMessageNumber, input.userFirstName, namePolicy, {
    isRecapClosing: input.stage === 'recap'
  });

  // Kickoff calls have no week behind them: goals on file replace the weekly data section.
  const contextSection =
    input.flow === 'kickoff'
      ? `Client goals on file (confirm conversationally — do not quote as a list to the user):
${(input.kickoffContext?.goalLines ?? []).map((line) => `- ${line}`).join('\n') || '- No goals recorded yet — help them name one.'}`
      : `Weekly data highlights (interpret conversationally — do not quote as a list to the user):
${input.weeklyReview.highlights.map((line) => `- ${line}`).join('\n') || '- Limited data logged this week.'}`;

  return `${COACH_CHECK_IN_JSON_PROMPT}

Current stage: ${input.stage}
Stage goal: ${stageGoalsFor(input.flow)[input.stage] ?? 'Continue the conversation naturally toward the recap.'}
${nameInstruction}

${contextSection}

Conversation so far:
${history || '(none)'}${userLine}`;
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

const itemizedMealItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative(),
  carbs: z.number().nonnegative(),
  fat: z.number().nonnegative(),
  role: z.enum(['PROTEIN', 'CARB', 'VEGETABLE', 'FAT', 'FRUIT', 'FREE'])
});

const itemizedMealSuggestionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  items: z.array(itemizedMealItemSchema).min(1).max(10)
});

const itemizedMealsResponseSchema = z.object({
  options: z.array(itemizedMealSuggestionSchema).min(1)
});

export function normalizeItemizedMealSuggestion(
  parsed: z.infer<typeof itemizedMealSuggestionSchema>
): ItemizedMealSuggestion {
  return {
    name: parsed.name.trim().slice(0, 60),
    description: parsed.description.trim().slice(0, 200),
    items: parsed.items.map((item) => ({
      name: item.name.trim(),
      quantity: Math.round(item.quantity * 100) / 100,
      unit: item.unit.trim(),
      calories: Math.round(item.calories),
      protein: roundMacro(item.protein),
      carbs: roundMacro(item.carbs),
      fat: roundMacro(item.fat),
      role: item.role
    }))
  };
}

export const itemizedMealSuggestionInput = itemizedMealSuggestionSchema;

function parseItemizedMealsResponse(text: string): ItemizedMealSuggestion[] {
  const parsed = parseModelJson(text);
  const result = itemizedMealsResponseSchema.safeParse(parsed);
  if (result.success) {
    return result.data.options.slice(0, 5).map(normalizeItemizedMealSuggestion);
  }
  // Loose fallback: accept a bare array or salvage the valid subset of options.
  const options = Array.isArray(parsed?.options) ? parsed.options : Array.isArray(parsed) ? parsed : [];
  const normalized: ItemizedMealSuggestion[] = [];
  for (const option of options) {
    const parsedOption = itemizedMealSuggestionSchema.safeParse(option);
    if (parsedOption.success) normalized.push(normalizeItemizedMealSuggestion(parsedOption.data));
  }
  if (normalized.length) return normalized.slice(0, 5);
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

function normalizeEnrichedMealPrepBatch(parsed: z.infer<typeof enrichedMealPrepBatchSchema>): EnrichedMealPrepBatch {
  const reheat = parsed.reheat?.trim() || null;
  return {
    id: parsed.id,
    container: parsed.container.trim(),
    // Older/partial model responses may omit prepStyle — a reheat step implies actual cooking.
    prepStyle: parsed.prepStyle ?? (reheat ? 'cook' : 'assemble'),
    reheat,
    storageNote: parsed.storageNote?.trim() || null
  };
}

function parseEnrichedMealPrepResponse(text: string, expectedIds: string[]): EnrichedMealPrepResult {
  const parsed = parseModelJson(text);
  const result = enrichedMealPrepResponseSchema.safeParse(parsed);
  const batches = result.success
    ? result.data.batches.map(normalizeEnrichedMealPrepBatch)
    : (() => {
        const looseBatches = Array.isArray(parsed?.batches) ? parsed.batches : [];
        const normalized: EnrichedMealPrepBatch[] = [];
        for (const batch of looseBatches) {
          const parsedBatch = enrichedMealPrepBatchSchema.safeParse(batch);
          if (parsedBatch.success) normalized.push(normalizeEnrichedMealPrepBatch(parsedBatch.data));
        }
        return normalized;
      })();

  if (!batches.length) {
    throw result.success ? new Error('Model returned no meal prep batches') : result.error;
  }

  const byId = new Map(batches.map((batch) => [batch.id, batch]));
  const ordered = expectedIds.map((id) => {
    const batch = byId.get(id);
    if (!batch) {
      throw new Error(`Model returned ${byId.size} of ${expectedIds.length} meal prep batches`);
    }
    return batch;
  });

  return {
    intro:
      (result.success ? result.data.intro?.trim() : parsed?.intro?.trim()) ||
      'Cook each batch once, portion it out, and label the containers by day.',
    batches: ordered
  };
}

export function mockMealPrepBatch(batch: MealPrepBatchInput): EnrichedMealPrepBatch {
  const lower = batch.label.toLowerCase();
  const coldKeywords = /salad|overnight oats|parfait|yogurt|smoothie|shake|jar/;
  const handheldKeywords = /wrap|sandwich|snack|bar|trail|nuts|jerky|crackers|toast/;
  // Does anything in the batch actually get heated, or is it mix-and-portion only?
  const heatKeywords =
    /chicken|beef|turkey|pork|steak|fish|salmon|shrimp|egg|rice|quinoa|pasta|potato|sausage|bacon|oatmeal|cooked|grilled|roasted|baked|scrambled|saut/;
  const needsCooking = batch.cookNow.some((item) => heatKeywords.test(item.name.toLowerCase()));

  if (coldKeywords.test(lower)) {
    return {
      id: batch.id,
      container: 'mason jar',
      prepStyle: needsCooking ? 'cook' : 'assemble',
      reheat: null,
      storageNote: 'Keep dressing or wet items at the bottom of the jar. Refrigerate up to 4 days.'
    };
  }

  if (handheldKeywords.test(lower)) {
    return {
      id: batch.id,
      container: 'ziplock bag',
      prepStyle: needsCooking ? 'cook' : 'assemble',
      reheat: null,
      storageNote: 'Store bags flat in the fridge (or pantry for dry snacks) up to 4 days.'
    };
  }

  if (!needsCooking) {
    return {
      id: batch.id,
      container: 'airtight container',
      prepStyle: 'assemble',
      reheat: null,
      storageNote: 'Refrigerate up to 4 days.'
    };
  }

  return {
    id: batch.id,
    container: 'microwave-safe container',
    prepStyle: 'cook',
    reheat: 'Microwave 2-3 minutes, stirring halfway, until steaming hot.',
    storageNote:
      batch.occurrenceCount > 4
        ? 'Refrigerate up to 4 days; freeze the extra portions and thaw overnight before reheating.'
        : 'Refrigerate up to 4 days.'
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

  async lookupFoodOptions(input: string): Promise<FoodEstimate[]> {
    const query = input.trim();
    const lower = query.toLowerCase();
    if (lower.includes('chicken')) {
      return [
        {
          normalizedFoodName: '6 oz grilled chicken breast',
          calories: 280,
          protein: 52,
          carbs: 0,
          fat: 6,
          confidence: 0.86
        },
        {
          normalizedFoodName: '1 cup diced rotisserie chicken',
          calories: 320,
          protein: 48,
          carbs: 0,
          fat: 14,
          confidence: 0.74
        },
        {
          normalizedFoodName: '4 oz breaded chicken tenders',
          calories: 290,
          protein: 18,
          carbs: 18,
          fat: 16,
          confidence: 0.68
        }
      ];
    }
    return this.lookupFood(query);
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

  /** Deterministic itemized meals, scaled to the context's targetCalories — powers dev/test without an API key. */
  async suggestItemizedMeals(input: string, context: string): Promise<ItemizedMealSuggestion[]> {
    let target = 500;
    try {
      const parsed = JSON.parse(context) as { targetCalories?: number };
      if (parsed.targetCalories && parsed.targetCalories > 0) target = parsed.targetCalories;
    } catch {
      // keep default
    }
    const factor = target / 500;
    const scale = (kcal: number) => Math.round(kcal * factor);
    const qty = (amount: number) => Math.round(amount * factor * 100) / 100;
    const spicy = input.toLowerCase().includes('spicy');

    const base: ItemizedMealSuggestion[] = [
      {
        name: spicy ? 'Fiery Chicken Rice Bowl' : 'Grilled Chicken Rice Bowl',
        description: spicy ? 'Chili-rubbed chicken over rice with charred peppers.' : 'Simple grilled chicken over rice with sautéed peppers.',
        items: [
          { name: 'Grilled chicken breast', quantity: qty(4), unit: 'oz', calories: scale(180), protein: 34, carbs: 0, fat: 4, role: 'PROTEIN' },
          { name: 'White rice, cooked', quantity: qty(0.75), unit: 'cup', calories: scale(160), protein: 3, carbs: 35, fat: 0, role: 'CARB' },
          { name: 'Sautéed peppers & onions', quantity: qty(1), unit: 'cup', calories: scale(50), protein: 1, carbs: 10, fat: 0, role: 'VEGETABLE' },
          { name: 'Olive oil', quantity: qty(0.5), unit: 'tbsp', calories: scale(60), protein: 0, carbs: 0, fat: 7, role: 'FAT' },
          { name: 'Salsa', quantity: 2, unit: 'tbsp', calories: scale(10), protein: 0, carbs: 2, fat: 0, role: 'FREE' }
        ]
      },
      {
        name: 'Salmon & Sweet Potato Plate',
        description: 'Roasted salmon with sweet potato and greens.',
        items: [
          { name: 'Roasted salmon', quantity: qty(4), unit: 'oz', calories: scale(200), protein: 23, carbs: 0, fat: 12, role: 'PROTEIN' },
          { name: 'Sweet potato, roasted', quantity: qty(0.75), unit: 'cup', calories: scale(135), protein: 2, carbs: 31, fat: 0, role: 'CARB' },
          { name: 'Garlic green beans', quantity: qty(1), unit: 'cup', calories: scale(60), protein: 2, carbs: 8, fat: 2, role: 'VEGETABLE' },
          { name: 'Lemon wedge', quantity: 1, unit: 'wedge', calories: 0, protein: 0, carbs: 0, fat: 0, role: 'FREE' }
        ]
      },
      {
        name: 'Turkey Taco Lettuce Wraps',
        description: 'Seasoned ground turkey in crisp lettuce cups with pico.',
        items: [
          { name: 'Ground turkey, seasoned', quantity: qty(4), unit: 'oz', calories: scale(170), protein: 30, carbs: 1, fat: 5, role: 'PROTEIN' },
          { name: 'Black beans', quantity: qty(0.5), unit: 'cup', calories: scale(110), protein: 7, carbs: 20, fat: 0.5, role: 'CARB' },
          { name: 'Lettuce cups', quantity: qty(4), unit: 'leaves', calories: scale(10), protein: 1, carbs: 2, fat: 0, role: 'VEGETABLE' },
          { name: 'Shredded cheese', quantity: qty(2), unit: 'tbsp', calories: scale(55), protein: 3.5, carbs: 0.5, fat: 4.5, role: 'FAT' },
          { name: 'Pico de gallo', quantity: 2, unit: 'tbsp', calories: scale(10), protein: 0, carbs: 2, fat: 0, role: 'FREE' }
        ]
      },
      {
        name: 'Veggie Egg Scramble Plate',
        description: 'Fluffy eggs scrambled with spinach and tomatoes, toast on the side.',
        items: [
          { name: 'Eggs, scrambled', quantity: Math.max(2, Math.round(3 * factor)), unit: 'egg', calories: scale(210), protein: 18, carbs: 0, fat: 15, role: 'PROTEIN' },
          { name: 'Sourdough toast', quantity: Math.max(1, Math.round(1.5 * factor)), unit: 'slice', calories: scale(135), protein: 4.5, carbs: 25, fat: 1, role: 'CARB' },
          { name: 'Spinach & tomato sauté', quantity: qty(1), unit: 'cup', calories: scale(25), protein: 2, carbs: 4, fat: 0, role: 'VEGETABLE' },
          { name: 'Hot sauce', quantity: 1, unit: 'tsp', calories: 0, protein: 0, carbs: 0, fat: 0, role: 'FREE' }
        ]
      }
    ];
    return base;
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

  async enrichMealPrep(batches: MealPrepBatchInput[]): Promise<EnrichedMealPrepResult> {
    return {
      intro: 'Cook each batch once, portion it out, and label the containers by day.',
      batches: batches.map(mockMealPrepBatch)
    };
  }

  async chat(messages: ChatMessage[], context: string, channel: ChatChannel = 'web', _systemAddendum?: string): Promise<string> {
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

  async runAgent(input: AgentRunInput): Promise<string> {
    const { messages, toolExecutor } = input;
    const last = messages.at(-1)?.content ?? '';
    const transcript = messages.map((message) => message.content).join('\n');
    const sharedPhone = extractPhoneFromUserText(last);
    if (sharedPhone && /sms|text|phone|number|reminder|setup|cell|mobile|contact/i.test(transcript)) {
      const out = await toolExecutor('update_sms_setup', { phone: sharedPhone });
      return String(out.result ?? out.error ?? 'Saved your phone.');
    }

    if (/\[the user attached a meal photo/i.test(last)) {
      const wantsLog = /\b(log|ate|had|here'?s|finished|eating)\b/i.test(last);
      const out = await toolExecutor('analyze_meal_photo', {
        log: wantsLog,
        mealName: parseTargetMealFromText(last)
      });
      return String(out.result ?? out.error ?? 'Here is your photo estimate.');
    }

    const water = parseWaterAmountOz(last);
    if (water != null) {
      const out = await toolExecutor('log_water', { amountOz: water, text: last });
      return String(out.result ?? out.error ?? 'Logged your water.');
    }

    if (looksLikeFoodAdd(last) || classifyFoodRegex(last) === 'LOG_FOOD') {
      const out = await toolExecutor('log_food', {
        foodText: extractFoodDescription(last),
        mealName: normalizeMealNameHint(parseTargetMealFromText(last))
      });
      return String(out.result ?? out.error ?? 'Logged it.');
    }

    if (wantsMacroStatus(last)) {
      const out = await toolExecutor('get_macro_status', {});
      return String(out.result ?? out.error ?? 'Here is where you stand today.');
    }

    return 'Got it! (mock agent — set AI_PROVIDER=gemini for the full conversation.)';
  }

  async coachCheckInTurn(input: CoachCheckInTurnInput): Promise<CoachCheckInTurnResult> {
    const name = input.userFirstName;
    const coach = input.coachId;
    const stages: CoachCheckInStage[] =
      input.flow === 'kickoff'
        ? ['welcome', 'why', 'goals', 'rhythm', 'first_focus', 'commitment', 'recap']
        : ['opening', 'wins', 'obstacles', 'data_reflection', 'pattern', 'focus', 'commitment', 'recap'];
    const stageIndex = stages.indexOf(input.stage);
    const responseStage =
      input.userMessage && stageIndex >= 0
        ? stages[Math.min(stageIndex + 1, stages.length - 1)]
        : input.stage;
    const stage = responseStage;

    if (input.flow === 'kickoff') {
      return this.mockKickoffTurn(stage, input);
    }

    const openers: Record<string, string> = {
      kali: `Aloha, ${name}. Before we look at anything — how is your heart feeling about this week?`,
      tess: `Hey ${name}. How are you really feeling about the week — not the numbers, just you?`,
      finn: `${name}, good to connect. How did this week land for you overall?`,
      nora: `Hi ${name}. Let's start simple — how are you feeling about the week?`,
      milo: `Hey ${name}! How's the week sitting with you right now?`,
      mets: `Kia ora, ${name}. How are you feeling about the week before we dig in?`
    };

    const byStage: Partial<Record<CoachCheckInStage, { message: string; chips: string[]; advance: boolean; done: boolean; recap?: CoachCheckInRecap }>> = {
      opening: {
        message: openers[coach] ?? openers.tess,
        chips: ['Pretty good', 'Mixed', 'Rough week', 'Not sure yet'],
        advance: false,
        done: false
      },
      wins: {
        message: `I hear you. What is one thing that went well — even something small?`,
        chips: ['Hit protein a few days', 'Logged honestly', 'Stayed active', 'Handled a tough day'],
        advance: true,
        done: false
      },
      obstacles: {
        message: `That counts. What got in the way when things did not go as planned?`,
        chips: ['Schedule', 'Stress', 'Social eating', 'Low energy'],
        advance: true,
        done: false
      },
      data_reflection: {
        message:
          input.weeklyReview.highlights[0]?.includes('on plan')
            ? `From what I can see, you had some solid on-plan moments — and a few spots where life pulled you off. Does that match how it felt?`
            : `It looks like logging was a bit spotty this week — no judgment. Does that match your experience?`,
        chips: ['Yes, that fits', 'Partly', 'Not really', 'Tell me more'],
        advance: true,
        done: false
      },
      pattern: {
        message: `The thread I notice is consistency when your days are predictable — and friction when plans shift. Does that ring true?`,
        chips: ['Yes', 'Somewhat', 'Different pattern', 'Still figuring it out'],
        advance: true,
        done: false
      },
      focus: {
        message: `For next week, let's pick one focus — not five. What feels most important to you?`,
        chips: ['Protein at lunch', 'Evening routine', 'Weekend planning', 'Logging every meal'],
        advance: true,
        done: false
      },
      commitment: {
        message: `Love it. What's one small support action — something you will actually do when the week gets messy?`,
        chips: ['Prep one meal', 'Text you before dinner', 'Set a reminder', 'Plan weekends on Thursday'],
        advance: true,
        done: false
      },
      recap: {
        message: (() => {
          const focus = input.userMessage?.trim() || 'one clear focus for the week ahead';
          return `${name}, I've got to hop off — but before I go: we're keeping "${focus}" front and center this week. I've saved the details below for you. If something comes up before our next check-in, just message me on your coach page. Talk soon.`;
        })(),
        chips: [],
        advance: true,
        done: true,
        recap: {
          win: 'You named what went well instead of skipping straight to guilt.',
          pattern: 'Predictable days are your friend; surprises need a simpler plan.',
          focus: input.userMessage?.trim() || 'One clear focus for the week ahead.',
          supportAction: 'Reach out before the meal that usually goes off-plan.'
        }
      }
    };

    const result = byStage[stage] ?? byStage.opening!;
    return {
      message: result.message,
      chips: result.chips,
      advance: Boolean(input.userMessage) || result.advance,
      done: result.done,
      recap: result.recap
    };
  }

  /** Deterministic kickoff (first check-in) flow for dev/test without an API key. */
  private mockKickoffTurn(stage: CoachCheckInStage, input: CoachCheckInTurnInput): CoachCheckInTurnResult {
    const name = input.userFirstName;
    const goalLine = input.kickoffContext?.goalLines[0] ?? 'the goal you set at signup';
    const byStage: Partial<Record<CoachCheckInStage, { message: string; chips: string[]; advance: boolean; done: boolean; recap?: CoachCheckInRecap }>> = {
      welcome: {
        message: `Welcome, ${name} — I'm so glad you're here. This first call is just about you and where we're headed. How are you feeling about getting started?`,
        chips: ['Excited', 'A little nervous', 'Ready', 'Not sure yet'],
        advance: false,
        done: false
      },
      why: {
        message: `That's a real answer, and I appreciate it. Tell me — why does this matter to you right now? Not the number on a scale, the real reason.`,
        chips: ['My health scared me', 'Keeping up with my kids', 'Feeling like myself again', 'An event coming up'],
        advance: true,
        done: false
      },
      goals: {
        message: `That's worth showing up for. Looking at what you set when you signed up — ${goalLine} — does that still feel like the right target?`,
        chips: ['Yes, that feels right', 'Maybe adjust it', 'Not sure how realistic it is'],
        advance: true,
        done: false
      },
      rhythm: {
        message: `Good. Here's how your week works: each day you build your meals — portions are already sized to you. Once a week, we talk like this, and your plan adjusts as your body changes. Simple as that. Make sense?`,
        chips: ['Makes sense', 'How do I build meals?', 'What if I miss a day?'],
        advance: true,
        done: false
      },
      first_focus: {
        message: `Then let's keep week one simple. One focus, small and winnable. What feels doable for you this week?`,
        chips: ['Log every meal', 'Hit my protein', 'Build dinner each night', 'Just show up daily'],
        advance: true,
        done: false
      },
      commitment: {
        message: `Perfect first focus. And one small support action for when the week gets messy — what will you actually do?`,
        chips: ['Set a daily reminder', 'Prep one meal ahead', 'Check the app each morning'],
        advance: true,
        done: false
      },
      recap: {
        message: (() => {
          const focus = input.userMessage?.trim() || 'one simple focus for week one';
          return `${name}, I need to run — but we're aligned. Week one is about ${focus}, and I've got everything saved below. Message me on your coach page anytime before our first weekly check-in. So glad you're here.`;
        })(),
        chips: [],
        advance: true,
        done: true,
        recap: {
          win: goalLine,
          pattern: 'Starting with a clear reason, not just a target.',
          focus: input.userMessage?.trim() || 'One simple, winnable focus for week one.',
          supportAction: 'A small daily anchor to stay connected.',
          motivation: 'Doing this to feel strong and present for the people who matter.'
        }
      }
    };
    const result = byStage[stage] ?? byStage.welcome!;
    return {
      message: result.message,
      chips: result.chips,
      advance: Boolean(input.userMessage) || result.advance,
      done: result.done,
      recap: result.recap
    };
  }

  async extractCoachMemory(input: CoachMemoryExtractionInput): Promise<CoachMemoryExtraction> {
    const lastUser = [...input.messages].reverse().find((entry) => entry.role === 'user')?.content.toLowerCase() ?? '';
    const removeFactTexts: string[] = [];
    if (/\bforget\b/.test(lastUser) && input.existingFacts.length) {
      removeFactTexts.push(input.existingFacts[input.existingFacts.length - 1]);
    }
    const newFacts: string[] = [];
    if (/\bsurgery\b/.test(lastUser) && !input.existingFacts.some((fact) => /surgery/i.test(fact))) {
      newFacts.push('Recovering from surgery');
    }
    const sessionSummary =
      input.messages.length >= 2
        ? `Talked about ${input.source.replace('_', ' ')} — ${input.messages.at(-1)?.content.slice(0, 120)}`
        : null;
    return { newFacts, removeFactTexts, sessionSummary };
  }

  async analyzeProgressPhotos(input: ProgressPhotoAnalysisInput): Promise<ProgressPhotoAnalysisResult> {
    const name = input.userFirstName;
    const pose = input.pose;
    const messages: Record<string, string> = {
      kali: `${name}, looking at your ${pose} photos, I can see a softer, more settled posture in the after shot — your midsection looks a touch more defined and you're standing taller. That kind of change usually comes from steady habits, not perfection. Keep tending what is already working.`,
      tess: `${name}, comparing these ${pose} photos, your waistline looks a bit cleaner and your stance looks more confident in the after shot. Nothing dramatic overnight — just clear, honest progress. Keep doing the simple things that got you here.`,
      finn: `${name}, the ${pose} comparison shows tighter lines through the midsection and better posture in the after photo. That is real progress you can build on. Stay consistent with the habits that created this shift.`,
      nora: `${name}, in these ${pose} photos I notice a clearer waistline and a more upright stance in the after shot. It is a solid visual win — keep stacking the same small habits.`,
      milo: `${name}, looking at your ${pose} before and after, the midsection looks a little tighter and you are standing taller. Nice work — keep the momentum going without overcomplicating it.`,
      mets: `${name}, these ${pose} photos show a quieter but real shift — a cleaner midsection line and more grounded posture in the after shot. That is the kind of progress that sticks. Keep the habits that got you here.`
    };

    return {
      message: messages[input.coachId] ?? messages.nora,
      overlays: { before: { lines: [] }, after: { lines: [] } }
    };
  }
}

function wrapAiError(error: unknown, action: string): Error {
  if (error instanceof z.ZodError) {
    const detail = error.issues[0]?.message ?? 'Invalid AI response';
    return new Error(`AI ${action} failed: ${detail}`);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('404 Not Found') && message.includes('model')) {
    return new Error(`Gemini model "${env.GEMINI_MODEL}" is unavailable. Set GEMINI_MODEL=gemini-3.6-flash in server/.env and restart the API.`);
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
  private ai: GoogleGenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.ai = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  /** True for Gemini 3.x+ models, which reject the legacy sampling/thinking-budget knobs. */
  private isGen3(): boolean {
    return /^gemini-(?:[3-9]|\d{2,})/.test(this.model);
  }

  /**
   * Normalizes a config for the active model. Gemini 3.x deprecated temperature/top_p/top_k and no
   * longer accepts thinkingBudget=0 (thinking can't be fully disabled), so we strip those knobs and
   * let the model use its defaults; older models keep them.
   */
  private tuneConfig(config: GenerateContentConfig): GenerateContentConfig {
    if (!this.isGen3()) return config;
    const { temperature, topP, topK, thinkingConfig, ...rest } = config;
    return rest;
  }

  /** Single-shot text/JSON generation. Returns the model's text output (empty string when none). */
  private async generate(contents: PartListUnion, config: GenerateContentConfig): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents,
      config: this.tuneConfig(config)
    });
    return response.text ?? '';
  }

  private jsonConfig(maxOutputTokens: number): GenerateContentConfig {
    return jsonModelConfig(maxOutputTokens);
  }

  async lookupFood(input: string): Promise<FoodEstimate[]> {
    const lines = splitFoodLines(input);
    const prompt = lines.length > 1
      ? `${FOOD_LOOKUP_PROMPT}\n\nFoods (${lines.length} items, one JSON entry each):\n${lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}`
      : `${FOOD_LOOKUP_PROMPT}\n\nFood: ${input.trim()}`;

    try {
      const text = await this.generate(prompt, this.jsonConfig(2048));
      return parseFoodLookupResponse(text);
    } catch (error) {
      try {
        const text = await this.generate(
          `${prompt}\n\nImportant: respond with valid JSON and at least one food item for every requested food.`,
          this.jsonConfig(2048)
        );
        return parseFoodLookupResponse(text);
      } catch (retryError) {
        throw wrapAiError(retryError, 'food lookup');
      }
    }
  }

  async lookupFoodOptions(input: string): Promise<FoodEstimate[]> {
    const query = input.trim();
    const prompt = `${FOOD_OPTIONS_PROMPT}\n\nSearch query: ${query}`;

    try {
      const text = await this.generate(prompt, this.jsonConfig(2048));
      return parseFoodLookupResponse(text).slice(0, 3);
    } catch (error) {
      try {
        const text = await this.generate(
          `${prompt}\n\nImportant: respond with valid JSON and between 1 and 3 food options.`,
          this.jsonConfig(2048)
        );
        return parseFoodLookupResponse(text).slice(0, 3);
      } catch (retryError) {
        throw wrapAiError(retryError, 'food options lookup');
      }
    }
  }

  async lookupFoodFromImage(image: { data: string; mimeType: string }, input = ''): Promise<FoodEstimate[]> {
    const prompt = `${FOOD_LOOKUP_PROMPT}

Estimate the visible food in this image. If the photo shows packaged food with a Nutrition Facts panel or printed calories per package/serving, read those label values and use them — do not guess when the label is readable.
Use the optional user note only as context; do not invent foods that are not visible.
Optional user note: ${input.trim() || 'none'}`;

    try {
      const text = await this.generate([
        { text: prompt },
        { inlineData: { mimeType: image.mimeType, data: image.data } }
      ], this.jsonConfig(2048));
      return parseFoodLookupResponse(text);
    } catch (error) {
      try {
        const text = await this.generate([
          { text: `${prompt}\n\nImportant: respond with valid JSON and at least one food item for the visible food.` },
          { inlineData: { mimeType: image.mimeType, data: image.data } }
        ], this.jsonConfig(2048));
        return parseFoodLookupResponse(text);
      } catch (retryError) {
        throw wrapAiError(retryError, 'food photo lookup');
      }
    }
  }

  async lookupExercises(input: string): Promise<ExerciseEstimate[]> {
    const query = input.trim();
    const prompt = `${EXERCISE_LOOKUP_PROMPT}\n\nUser query: ${query}`;

    try {
      const text = await this.generate(prompt, this.jsonConfig(4096));
      return parseExerciseLookupResponse(text);
    } catch (error) {
      try {
        const text = await this.generate(
          `${prompt}\n\nImportant: respond with valid JSON only and no more than 4 items.`,
          this.jsonConfig(4096)
        );
        return parseExerciseLookupResponse(text);
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
      const text = await withTimeout(this.generate(prompt, this.jsonConfig(2048)), MEAL_SUGGESTION_TIMEOUT_MS, 'Meal suggestions');
      return parseMealSuggestionResponse(text);
    } catch (error) {
      try {
        const text = await withTimeout(
          this.generate(`${prompt}\n\nImportant: respond with valid JSON only and include exactly 3 options.`, this.jsonConfig(2048)),
          MEAL_SUGGESTION_TIMEOUT_MS,
          'Meal suggestion retry'
        );
        return parseMealSuggestionResponse(text);
      } catch {
        try {
          return await new MockAiProvider().suggestMealOptions(input, context);
        } catch {
          throw wrapAiError(error, 'meal suggestions');
        }
      }
    }
  }

  async suggestItemizedMeals(input: string, context: string): Promise<ItemizedMealSuggestion[]> {
    const prompt = `${ITEMIZED_MEALS_PROMPT}

Meal context:
${context}

User request:
${input.trim() || 'No specific request — surprise me with variety.'}`;

    try {
      const text = await withTimeout(this.generate(prompt, this.jsonConfig(2048)), ITEMIZED_MEALS_TIMEOUT_MS, 'Itemized meals');
      return parseItemizedMealsResponse(text);
    } catch (error) {
      try {
        const text = await withTimeout(
          this.generate(`${prompt}\n\nImportant: respond with valid JSON only, exactly 4 options, every item must include all fields.`, this.jsonConfig(2048)),
          ITEMIZED_MEALS_TIMEOUT_MS,
          'Itemized meals retry'
        );
        return parseItemizedMealsResponse(text);
      } catch {
        try {
          return await new MockAiProvider().suggestItemizedMeals(input, context);
        } catch {
          throw wrapAiError(error, 'meal recommendations');
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
      const text = await withTimeout(this.generate(prompt, this.jsonConfig(2048)), SHOPPING_LIST_TIMEOUT_MS, 'Shopping list');
      return parseEnrichedShoppingListResponse(text, expectedIds);
    } catch (error) {
      try {
        const text = await withTimeout(
          this.generate(`${prompt}\n\nImportant: respond with valid JSON only and include every input id exactly once.`, this.jsonConfig(2048)),
          SHOPPING_LIST_TIMEOUT_MS,
          'Shopping list retry'
        );
        return parseEnrichedShoppingListResponse(text, expectedIds);
      } catch (retryError) {
        throw wrapAiError(retryError, 'shopping list');
      }
    }
  }

  async enrichMealPrep(batches: MealPrepBatchInput[]): Promise<EnrichedMealPrepResult> {
    const expectedIds = batches.map((batch) => batch.id);
    const prompt = `${MEAL_PREP_PROMPT}

Prep batches JSON:
${JSON.stringify(batches)}`;

    try {
      const text = await withTimeout(this.generate(prompt, this.jsonConfig(2048)), MEAL_PREP_TIMEOUT_MS, 'Meal prep');
      return parseEnrichedMealPrepResponse(text, expectedIds);
    } catch (error) {
      try {
        const text = await withTimeout(
          this.generate(`${prompt}\n\nImportant: respond with valid JSON only and include every input id exactly once.`, this.jsonConfig(2048)),
          MEAL_PREP_TIMEOUT_MS,
          'Meal prep retry'
        );
        return parseEnrichedMealPrepResponse(text, expectedIds);
      } catch (retryError) {
        throw wrapAiError(retryError, 'meal prep');
      }
    }
  }

  async chat(messages: ChatMessage[], context: string, channel: ChatChannel = 'web', systemAddendum?: string): Promise<string> {
    try {
      const channelInstruction = channel === 'sms' ? `\n\n${SMS_ASSISTANT_ADDENDUM}` : '';
      const personaInstruction = systemAddendum?.trim() ? `\n\n${systemAddendum.trim()}` : '';
      const contextTurn: Content[] = [
        { role: 'user', parts: [{ text: `Program data (JSON):\n${context}` }] },
        { role: 'model', parts: [{ text: 'Understood. I will answer using this program data.' }] }
      ];
      const history: Content[] = [
        ...contextTurn,
        ...messages.slice(0, -1).map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }]
        }))
      ];
      const last = messages.at(-1);
      if (!last) throw new Error('Message required');

      const chat = this.ai.chats.create({
        model: this.model,
        history,
        config: this.tuneConfig({
          ...chatModelConfig(),
          systemInstruction: `${ASSISTANT_SYSTEM}${personaInstruction}${channelInstruction}`
        })
      });
      const result = await chat.sendMessage({ message: last.content });
      return (result.text ?? '').trim();
    } catch (error) {
      throw wrapAiError(error, 'chat');
    }
  }

  async classifyNutritionIntent(message: string): Promise<NutritionIntent> {
    const prompt = `${CLASSIFY_INTENT_PROMPT}\n\nMessage: ${message.trim()}`;
    try {
      const text = await withTimeout(
        this.generate(prompt, this.jsonConfig(2048)),
        CLASSIFY_INTENT_TIMEOUT_MS,
        'Intent classification'
      );
      const parsed = classifyIntentSchema.safeParse(parseModelJson(text));
      if (parsed.success) return parsed.data.intent;
      return new MockAiProvider().classifyNutritionIntent(message);
    } catch {
      return new MockAiProvider().classifyNutritionIntent(message);
    }
  }

  async runAgent(input: AgentRunInput): Promise<string> {
    const { messages, context, tools, toolExecutor, abortSignal, systemPrompt } = input;
    const last = messages.at(-1);
    if (!last) throw new Error('Message required');

    // Gemini 3.x rejects prefilled model turns, so the program data goes into the system instruction
    // (not a fake "Understood." model turn). History is the real conversation only.
    const systemWithContext = `${systemPrompt ?? AGENT_SYSTEM}\n\nProgram data (JSON) — the user's live plan; use it and the tools, never invent facts:\n${context}`;
    const history: Content[] = messages.slice(0, -1).map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    }));

    // Text + tools chat — plain text config (responseMimeType JSON is incompatible with tool calling).
    // tuneConfig() drops the sampling/thinking knobs Gemini 3.x rejects; the SDK carries Gemini 3
    // thought signatures across tool turns automatically, which keeps multi-step tool calls reliable.
    // maxOutputTokens is generous because 3.x thinking tokens share this budget — too low and the
    // model can burn the whole budget thinking and return empty text (the coach "just stops").
    const chat = this.ai.chats.create({
      model: this.model,
      history,
      config: this.tuneConfig({
        systemInstruction: systemWithContext,
        tools: [{ functionDeclarations: tools }],
        toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
        temperature: 0.4,
        maxOutputTokens: 8192,
        abortSignal
      })
    });

    try {
      let result = await chat.sendMessage({ message: last.content });
      let lastToolResult: string | undefined;
      let lastToolError: string | undefined;

      // Drives tool calls to completion: run each requested tool, feed results back, repeat.
      const drainToolCalls = async () => {
        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
          if (abortSignal?.aborted) throw new Error('SMS assistant cancelled');
          const calls = result.functionCalls;
          if (!calls?.length) return;

          const responses: Part[] = [];
          for (const call of calls) {
            if (abortSignal?.aborted) throw new Error('SMS assistant cancelled');
            const name = call.name ?? '';
            let output: Record<string, unknown>;
            try {
              output = await toolExecutor(name, (call.args ?? {}) as Record<string, unknown>);
            } catch (error) {
              output = { error: error instanceof Error ? error.message : 'Tool failed.' };
            }
            if (typeof output.result === 'string' && output.result.trim()) {
              lastToolResult = output.result.trim();
              lastToolError = undefined;
            } else if (output.error) {
              lastToolResult = undefined;
              lastToolError = typeof output.error === 'string' ? output.error : 'Tool failed.';
            }
            responses.push({ functionResponse: { id: call.id, name, response: output } });
          }

          result = await chat.sendMessage({ message: responses });
        }
      };

      await drainToolCalls();

      let text = (result.text ?? '').trim();

      // The model sometimes returns nothing (empty candidate / truncated thinking) — the "just
      // stopped" symptom. Nudge once for a real reply or a tool call instead of faking a "Got it!".
      if (!text && !result.functionCalls?.length && !lastToolResult && !lastToolError) {
        result = await chat.sendMessage({
          message:
            'Please reply to my last message now. If I asked you to change or look something up in my plan, call the right tool first and confirm from its result — do not just acknowledge.'
        });
        await drainToolCalls();
        text = (result.text ?? '').trim();
      }

      if (result.functionCalls?.length) {
        return 'I need one more detail to finish that — could you say it a bit more specifically?';
      }

      if (text) return text;
      if (lastToolError) return lastToolError;
      if (lastToolResult) return lastToolResult;
      // Never fabricate success: be honest that nothing came through rather than saying "Got it!".
      return "Sorry, I lost my train of thought there — could you say that again? I don't want to say I did something I didn't.";
    } catch (error) {
      throw wrapAiError(error, 'assistant');
    }
  }

  async coachCheckInTurn(input: CoachCheckInTurnInput): Promise<CoachCheckInTurnResult> {
    const prompt = buildCoachCheckInPrompt(input);
    try {
      const text = await this.generate(prompt, {
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
        systemInstruction: input.systemPrompt
      });
      return parseCoachCheckInTurn(text);
    } catch (error) {
      try {
        return await new MockAiProvider().coachCheckInTurn(input);
      } catch {
        throw wrapAiError(error, 'coach check-in');
      }
    }
  }

  async extractCoachMemory(input: CoachMemoryExtractionInput): Promise<CoachMemoryExtraction> {
    const transcript = input.messages
      .slice(-24)
      .map((entry) => `${entry.role === 'user' ? 'User' : 'Coach'}: ${entry.content}`)
      .join('\n');
    const prompt = `${COACH_MEMORY_EXTRACTION_PROMPT}

Source: ${input.source}
Existing facts: ${JSON.stringify(input.existingFacts)}
Existing summaries: ${JSON.stringify(input.existingSummaries)}

Conversation:
${transcript}`;

    try {
      const text = await this.generate(prompt, this.jsonConfig(2048));
      return parseCoachMemoryExtraction(text);
    } catch {
      return new MockAiProvider().extractCoachMemory(input);
    }
  }

  async analyzeProgressPhotos(input: ProgressPhotoAnalysisInput): Promise<ProgressPhotoAnalysisResult> {
    const prompt = buildProgressPhotoAnalysisPrompt(input);
    const parts = [
      { text: prompt },
      { text: 'BEFORE photo:' },
      { inlineData: { mimeType: input.beforeImage.mimeType, data: input.beforeImage.data } },
      { text: 'AFTER photo:' },
      { inlineData: { mimeType: input.afterImage.mimeType, data: input.afterImage.data } }
    ];

    try {
      const text = await this.generate(parts, this.jsonConfig(2048));
      return parseProgressPhotoAnalysis(text);
    } catch (error) {
      try {
        const text = await this.generate([
          {
            text: `${prompt}\n\nImportant: respond with valid JSON only as { "message": "..." }. Do not invent overlay coordinates.`
          },
          { text: 'BEFORE photo:' },
          { inlineData: { mimeType: input.beforeImage.mimeType, data: input.beforeImage.data } },
          { text: 'AFTER photo:' },
          { inlineData: { mimeType: input.afterImage.mimeType, data: input.afterImage.data } }
        ], this.jsonConfig(2048));
        return parseProgressPhotoAnalysis(text);
      } catch {
        try {
          return await new MockAiProvider().analyzeProgressPhotos(input);
        } catch {
          throw wrapAiError(error, 'progress photo analysis');
        }
      }
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
