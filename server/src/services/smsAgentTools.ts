/** Tool catalog for the conversational SMS agent. Each tool wraps an existing SMS handler. */
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import {
  SmsResponseError,
  handleFoodLog,
  handleFoodPhoto,
  handleLogLastPhotoEstimate,
  handleMacroStatus,
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

export function buildSmsToolDeclarations(): FunctionDeclaration[] {
  return [
    {
      name: 'get_macro_status',
      description: "Report how many calories and grams of protein the user has left today and their next meal. Read-only."
    },
    {
      name: 'log_food',
      description:
        'Log food the user already ate or is eating now. Provide the food(s) with amounts. Use for "had 6 oz chicken and rice", "add 2 oz peanuts to breakfast".',
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          foodText: {
            type: SchemaType.STRING,
            description: 'The food(s) and amounts, e.g. "6 oz chicken and a cup of rice".'
          },
          mealName: { type: SchemaType.STRING, description: MEAL_PARAM_DESC }
        },
        required: ['foodText']
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
        'Suggest meal or restaurant options that fit the user\'s macros. Use when they ask what/where to eat. Read-only — does not log anything.',
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
      case 'log_food': {
        if (signal?.aborted) return { error: 'Request cancelled.' };
        const foodText = str(args.foodText);
        if (!foodText) return { error: 'I need the food and amount to log it.' };
        const result = await handleFoodLog(ctx.userId, ctx.dateKey, ctx.timeZone, foodText, str(args.mealName) || undefined);
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
