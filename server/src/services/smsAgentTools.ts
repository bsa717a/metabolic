/** Tool catalog for the conversational SMS agent. Each tool wraps an existing SMS handler. */
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import {
  SmsResponseError,
  handleFoodLog,
  handleFoodMacroCorrection,
  handleFoodPhoto,
  handleLogLastPhotoEstimate,
  handleMacroStatus,
  handleMealDetails,
  handleExerciseDetails,
  handleHydrationStatus,
  handleProgressStatus,
  handlePlanTargets,
  handleMealCorrection,
  handleMealSuggestion,
  handleWriteAction,
  type DownloadedSmsImage,
  type SmsMedia
} from './smsIntentService.js';
import type { StoredPhotoEstimateItem } from '../utils/smsFoodParse.js';

/** A clarification the model wants before it can finish an action (createdAt is stamped at persist time). */
export type PendingActionRequest = {
  tool: string;
  args: Record<string, unknown>;
  question: string;
};

export type SmsToolContext = {
  userId: string;
  phone: string;
  dateKey: string;
  timeZone: string | null;
  /** Inbound text / photo caption for the current message. */
  message: string;
  /** Set when the user attached a meal photo this message (already downloaded). */
  image?: DownloadedSmsImage;
  media?: SmsMedia;
  /** Set when a photo was attached but could not be downloaded. */
  imageError?: string;
  // --- side-channel outputs the orchestrator reads after the loop ---
  /** Latest fresh-photo estimate, for stashing so "log that for dinner" works next turn. */
  photoEstimate?: { items: StoredPhotoEstimateItem[]; mealName: string; logged: boolean };
  /** Set when the model asked a clarifying question instead of acting. */
  pendingAction?: PendingActionRequest;
  /** Audit log of tool calls made this turn. */
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
};

const MEAL_PARAM_DESC = 'Meal name: breakfast, lunch, dinner, snack, or brunch. Omit to use the current/next meal.';
const DATE_PARAM_DESC = 'Which day: "today" (default), "yesterday", "tomorrow", or a YYYY-MM-DD date.';

export function buildSmsToolDeclarations(): FunctionDeclaration[] {
  return [
    {
      name: 'get_macro_status',
      description:
        "Report how many calories and protein the user has LEFT/remaining today and their next meal. Read-only. Do NOT use this for the macros of a specific meal — use get_meal_details for that."
    },
    {
      name: 'get_meal_details',
      description:
        "Look up the user's own planned/logged foods and full macros — calories, protein, carbs, AND fat. With a meal name, returns that meal's macros and item breakdown; with no meal, returns the whole day's plan totals and per-meal macros. Use for any question about their meals, calories, carbs, or fat (e.g. \"macros for lunch\", \"how many carbs in dinner\", \"what's my plan tomorrow\", \"calories I ate yesterday\"). Read-only.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          meal: { type: SchemaType.STRING, description: MEAL_PARAM_DESC },
          date: { type: SchemaType.STRING, description: DATE_PARAM_DESC }
        }
      }
    },
    {
      name: 'get_exercise_details',
      description:
        "Look up the user's scheduled workout — exercises, sets/reps, and which are done. Use for \"what's my workout\", \"how many sets of X\", \"did I finish my workout\". Read-only.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: { date: { type: SchemaType.STRING, description: DATE_PARAM_DESC } }
      }
    },
    {
      name: 'get_hydration_status',
      description:
        'Report the user\'s water intake vs their goal today, and their water streak. Use for "how much water have I had", "did I hit my water goal". Read-only.'
    },
    {
      name: 'get_progress',
      description:
        'Report the user\'s current weight vs their start and goal and how much they\'ve changed. Use for "what\'s my weight", "how much have I lost", "my progress". Read-only.'
    },
    {
      name: 'get_plan_targets',
      description:
        'Report the user\'s daily calorie and macro TARGETS (calories, protein, carbs, fat) and current plan week. Use for "what are my targets/goals", "what week am I on". Read-only. (For remaining amounts use get_macro_status.)'
    },
    {
      name: 'log_food',
      description:
        'Log food the user already ate or is eating now. Provide the food(s) with amounts. Use for "had 6 oz chicken and rice", "add 2 oz peanuts to breakfast". If the user states exact calories/macros for the food (e.g. "log the sorbet, 190 cal 28g carbs 6g fat 4g protein"), pass them in calories/protein/carbs/fat so they are recorded verbatim instead of estimated.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          foodText: {
            type: SchemaType.STRING,
            description: 'The food(s) and amounts, e.g. "6 oz chicken and a cup of rice".'
          },
          mealName: { type: SchemaType.STRING, description: MEAL_PARAM_DESC },
          calories: { type: SchemaType.NUMBER, description: 'Exact calories if the user stated them. Omit to let the app estimate.' },
          protein: { type: SchemaType.NUMBER, description: 'Exact protein grams if stated.' },
          carbs: { type: SchemaType.NUMBER, description: 'Exact carb grams if stated.' },
          fat: { type: SchemaType.NUMBER, description: 'Exact fat grams if stated.' }
        },
        required: ['foodText']
      }
    },
    {
      name: 'correct_last_food',
      description:
        "Correct the macros of the food most recently logged, updating it in place (never logs a new item). Use when the user gives the real numbers for something just logged — e.g. \"here are the actual macros for that: 190 cal, 28g carbs, 6g fat, 4g protein\" or \"it was actually 190 calories\". At least one of calories/protein/carbs/fat is required.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          calories: { type: SchemaType.NUMBER, description: 'Corrected calories.' },
          protein: { type: SchemaType.NUMBER, description: 'Corrected protein grams.' },
          carbs: { type: SchemaType.NUMBER, description: 'Corrected carb grams.' },
          fat: { type: SchemaType.NUMBER, description: 'Corrected fat grams.' },
          foodName: { type: SchemaType.STRING, description: 'Optional corrected name for the item.' }
        }
      }
    },
    {
      name: 'analyze_meal_photo',
      description:
        'Estimate calories/macros from the meal photo attached to THIS message. Set log=true only when the user clearly wants it logged now; otherwise it just returns an estimate and offers to log.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          log: { type: SchemaType.BOOLEAN, description: 'True to log the estimate to a meal now.' },
          mealName: { type: SchemaType.STRING, description: MEAL_PARAM_DESC }
        }
      }
    },
    {
      name: 'log_photo_estimate',
      description:
        'Log the most recent photo estimate to a meal. Use for a follow-up like "log that for dinner" when NO new photo is attached this message.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          mealName: { type: SchemaType.STRING, description: MEAL_PARAM_DESC }
        }
      }
    },
    {
      name: 'move_food_to_meal',
      description:
        'Move the most recently logged food to a different meal. Use for corrections like "that should be breakfast" or "move it to lunch".',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          targetMealName: { type: SchemaType.STRING, description: 'The meal it should be moved to.' }
        },
        required: ['targetMealName']
      }
    },
    {
      name: 'mark_meal_complete',
      description: 'Mark a meal eaten as planned. Use for "mark lunch complete", "mark breakfast as eaten".',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          mealName: { type: SchemaType.STRING, description: MEAL_PARAM_DESC }
        }
      }
    },
    {
      name: 'mark_exercise_done',
      description: 'Mark a single planned exercise done. Optionally name it; omit to use the next planned exercise.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          exerciseName: { type: SchemaType.STRING, description: 'Name of the exercise to mark done.' }
        }
      }
    },
    {
      name: 'mark_all_exercises_done',
      description: "Mark all of today's planned exercises done. Use for \"mark all exercises done\" or \"workout done\"."
    },
    {
      name: 'log_water',
      description: 'Log water intake in ounces. Use for "16 oz water" or "drank a glass of water" (~8 oz).',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          amountOz: { type: SchemaType.NUMBER, description: 'Ounces of water consumed.' },
          text: { type: SchemaType.STRING, description: 'Original phrasing, optional.' }
        },
        required: ['amountOz']
      }
    },
    {
      name: 'suggest_meals',
      description:
        'Suggest NEW meal or restaurant options that fit the user\'s macros. Use only when they ask what or where to eat (recommendations). Do NOT use to report the macros of a meal they already have — that is get_meal_details. Read-only.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          request: { type: SchemaType.STRING, description: "The user's request, e.g. \"high protein options at Chipotle\"." }
        }
      }
    },
    {
      name: 'request_clarification',
      description:
        'Ask the user ONE short question when a required detail for an action is genuinely missing and cannot be safely guessed. Do not use for read-only questions.',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          tool: { type: SchemaType.STRING, description: 'The tool you intend to call once they answer.' },
          partialArgs: {
            type: SchemaType.OBJECT,
            description: 'Arguments you already know for that tool.',
            properties: {
              foodText: { type: SchemaType.STRING },
              mealName: { type: SchemaType.STRING },
              targetMealName: { type: SchemaType.STRING },
              exerciseName: { type: SchemaType.STRING },
              amountOz: { type: SchemaType.NUMBER }
            }
          },
          question: { type: SchemaType.STRING, description: 'The short question to text the user.' }
        },
        required: ['tool', 'question']
      }
    }
  ];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Coerce a model-supplied numeric arg; returns undefined for missing/non-finite values. */
function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/** Runs a tool the model called and returns a JSON-serializable result/error the model can read. */
export async function executeSmsTool(
  ctx: SmsToolContext,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  if (signal?.aborted) return { error: 'Request cancelled.' };
  ctx.toolCalls.push({ name, args });
  try {
    switch (name) {
      case 'get_macro_status': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const result = await handleMacroStatus(ctx.userId, ctx.dateKey, ctx.timeZone);
        return { result };
      }
      case 'get_meal_details': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const result = await handleMealDetails(
          ctx.userId,
          ctx.dateKey,
          ctx.timeZone,
          str(args.meal) || undefined,
          str(args.date) || undefined
        );
        return { result };
      }
      case 'get_exercise_details': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const result = await handleExerciseDetails(ctx.userId, ctx.dateKey, ctx.timeZone, str(args.date) || undefined);
        return { result };
      }
      case 'get_hydration_status': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const result = await handleHydrationStatus(ctx.userId, ctx.dateKey, ctx.timeZone);
        return { result };
      }
      case 'get_progress': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const result = await handleProgressStatus(ctx.userId, ctx.dateKey, ctx.timeZone);
        return { result };
      }
      case 'get_plan_targets': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const result = await handlePlanTargets(ctx.userId, ctx.dateKey, ctx.timeZone);
        return { result };
      }
      case 'log_food': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const foodText = str(args.foodText);
        if (!foodText) return { error: 'I need the food and amount to log it.' };
        const calories = num(args.calories);
        const explicit =
          calories != null && calories > 0
            ? { calories, protein: num(args.protein), carbs: num(args.carbs), fat: num(args.fat) }
            : undefined;
        const result = await handleFoodLog(ctx.userId, ctx.dateKey, ctx.timeZone, foodText, str(args.mealName) || undefined, explicit);
        return { result };
      }
      case 'correct_last_food': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const result = await handleFoodMacroCorrection(ctx.userId, ctx.dateKey, ctx.timeZone, {
          calories: num(args.calories),
          protein: num(args.protein),
          carbs: num(args.carbs),
          fat: num(args.fat),
          foodName: str(args.foodName) || undefined
        });
        return { result };
      }
      case 'analyze_meal_photo': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        if (!ctx.image) return { error: ctx.imageError ?? 'There is no photo attached to this message.' };
        const mealName = str(args.mealName);
        const caption = mealName ? `${ctx.message} for ${mealName}`.trim() : ctx.message;
        const reply = await handleFoodPhoto(
          ctx.userId,
          ctx.dateKey,
          ctx.timeZone,
          ctx.media ?? { url: '' },
          caption,
          args.log === true,
          ctx.image
        );
        ctx.photoEstimate = { items: reply.estimateItems, mealName: reply.mealName, logged: reply.logged };
        return { result: reply.text };
      }
      case 'log_photo_estimate': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const result = await handleLogLastPhotoEstimate(
          ctx.userId,
          ctx.phone,
          ctx.dateKey,
          ctx.timeZone,
          str(args.mealName) || undefined
        );
        return { result };
      }
      case 'move_food_to_meal': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const target = str(args.targetMealName);
        if (!target) return { error: 'Which meal should I move it to?' };
        const result = await handleMealCorrection(ctx.userId, ctx.phone, ctx.dateKey, ctx.timeZone, target);
        return { result };
      }
      case 'mark_meal_complete': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const result = await handleWriteAction(ctx.userId, ctx.dateKey, ctx.timeZone, {
          intent: 'MARK_MEAL_COMPLETE',
          mealName: str(args.mealName) || undefined
        });
        return { result };
      }
      case 'mark_exercise_done': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const result = await handleWriteAction(ctx.userId, ctx.dateKey, ctx.timeZone, {
          intent: 'MARK_EXERCISE_DONE',
          exerciseName: str(args.exerciseName) || undefined
        });
        return { result };
      }
      case 'mark_all_exercises_done': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const result = await handleWriteAction(ctx.userId, ctx.dateKey, ctx.timeZone, {
          intent: 'MARK_ALL_EXERCISES_DONE'
        });
        return { result };
      }
      case 'log_water': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const amountOz = Number(args.amountOz);
        if (!Number.isFinite(amountOz) || amountOz <= 0) return { error: 'How many ounces of water?' };
        const result = await handleWriteAction(ctx.userId, ctx.dateKey, ctx.timeZone, {
          intent: 'LOG_WATER',
          amountOz,
          text: str(args.text) || ctx.message
        });
        return { result };
      }
      case 'suggest_meals': {
        const result = await handleMealSuggestion(ctx.userId, str(args.request) || ctx.message);
        return { result };
      }
      case 'request_clarification': {
        const question = str(args.question) || 'Could you give me a little more detail?';
        ctx.pendingAction = {
          tool: str(args.tool),
          args: (args.partialArgs && typeof args.partialArgs === 'object'
            ? (args.partialArgs as Record<string, unknown>)
            : {}),
          question
        };
        return { result: question };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    if (error instanceof SmsResponseError) return { error: error.message };
    return { error: error instanceof Error ? error.message : 'That action failed.' };
  }
}
