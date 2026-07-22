/**
 * Shared meal-management tool catalog for BOTH the web coach and the SMS coach.
 * These tools let the coach fully build and maintain a plan by chat: read a meal, add/update/remove
 * a single item, create or delete a meal, rename it, change its time, replace all its items, or copy
 * it across days. Every mutation returns the resulting meal state so the model confirms from real data.
 */
import { Type, type FunctionDeclaration } from '@google/genai';
import {
  applyAddMealItem,
  applyCopyMealToDays,
  applyCreateMeal,
  applyDeleteMeal,
  applyMealRename,
  applyMealTimeChange,
  applyPlannedMealUpdate,
  applyRemoveMealItem,
  applyUpdateMealItem,
  PlanEditError,
  type MealRenameFocus
} from './planEditService.js';
import { handleMealDetails } from './smsIntentService.js';

/** Meal the user is actively editing — restricts the coach to plan changes and pins edits to it. */
export type MealEditFocus = {
  mealName: string;
  mealId?: string;
  date: string;
  targetCalories?: number;
};

/** Meal the user is currently reviewing/discussing — targets edits without locking into edit mode. */
export type ActiveMealContext = {
  mealId: string;
  mealName: string;
  date: string;
};

export type MealToolContext = {
  userId: string;
  dateKey: string;
  timeZone: string | null;
  /** The user's current chat message. */
  message: string;
  /** Audit log of tool calls made this turn. */
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  /** When set, the user is editing one planned meal. */
  mealEditFocus?: MealEditFocus;
  /** Reviewed/discussed meal; used to target edits without meal-edit restrictions. */
  activeMeal?: ActiveMealContext;
};

/** Names of every meal-management tool, shared by both channels. */
export const MEAL_MANAGEMENT_TOOLS = new Set([
  'get_meal_details',
  'update_planned_meals',
  'add_meal_item',
  'update_meal_item',
  'remove_meal_item',
  'create_meal',
  'delete_meal',
  'rename_meal',
  'update_meal_time',
  'copy_meal_to_days'
]);

/** Tools that edit an existing meal's contents (allowed while a meal-edit session is active). */
export const MEAL_EDIT_TOOLS = new Set([
  'get_meal_details',
  'update_planned_meals',
  'add_meal_item',
  'update_meal_item',
  'remove_meal_item',
  'rename_meal',
  'update_meal_time'
]);

const DATE_DESC = 'Target day, YYYY-MM-DD. Today or up to 31 days ahead. Resolve relative dates like "tomorrow" from context.today.date. Defaults to today or the meal in focus.';
const MEAL_NAME_DESC = 'Meal title to target, e.g. "Breakfast", "Lunch", "Dinner", "Snack". Optional when a mealId or meal-edit focus is available.';
const MEAL_ID_DESC = 'Exact meal id when known from context (meal-edit focus or a prior get_meal_details).';

const ITEM_PROPS = {
  name: { type: Type.STRING, description: 'Food name, e.g. "Banana" or "2 eggs scrambled".' },
  quantity: { type: Type.NUMBER, description: 'Amount, default 1.' },
  unit: { type: Type.STRING, description: 'Unit, e.g. "serving", "cup", "oz". Default "serving".' },
  calories: { type: Type.NUMBER, description: 'Calories for this quantity.' },
  protein: { type: Type.NUMBER, description: 'Protein grams for this quantity.' },
  carbs: { type: Type.NUMBER, description: 'Carb grams for this quantity.' },
  fat: { type: Type.NUMBER, description: 'Fat grams for this quantity.' }
} as const;

export function buildMealToolDeclarations(): FunctionDeclaration[] {
  return [
    {
      name: 'get_meal_details',
      description:
        "Look up the user's own planned/logged foods and full macros — calories, protein, carbs, AND fat. With a meal name, returns that meal's macros and item breakdown (including each item's id, useful before editing); with no meal, returns the whole day's plan. Use for any question about their meals, and ALWAYS before editing a meal you don't already have ids for. Read-only.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          meal: { type: Type.STRING, description: MEAL_NAME_DESC },
          date: { type: Type.STRING, description: DATE_DESC }
        }
      }
    },
    {
      name: 'create_meal',
      description:
        'Add a brand-new meal slot to a day (e.g. "add a 3pm snack", "add a second breakfast"). Optionally seed it with foods. Use this to build out a day; do NOT use it to change an existing meal.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          mealName: { type: Type.STRING, description: 'Title for the new meal, e.g. "Afternoon Snack".' },
          date: { type: Type.STRING, description: DATE_DESC },
          plannedTime: { type: Type.STRING, description: 'Optional time, e.g. "3pm" or "15:00".' },
          items: {
            type: Type.ARRAY,
            description: 'Optional starting foods for the meal.',
            items: { type: Type.OBJECT, properties: ITEM_PROPS, required: ['name', 'calories', 'protein', 'carbs', 'fat'] }
          }
        },
        required: ['mealName']
      }
    },
    {
      name: 'delete_meal',
      description:
        'Remove an entire meal slot from a day (e.g. "delete the snack", "remove dinner"). Refused if that meal already has logged food. Do NOT use to clear items — use remove_meal_item for that.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          mealName: { type: Type.STRING, description: MEAL_NAME_DESC },
          mealId: { type: Type.STRING, description: MEAL_ID_DESC },
          date: { type: Type.STRING, description: DATE_DESC }
        }
      }
    },
    {
      name: 'add_meal_item',
      description:
        'Add ONE food to an existing meal without touching the other foods (e.g. "add a banana to breakfast", "add 2 oz almonds to my snack"). Estimate realistic macros for the amount.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          ...ITEM_PROPS,
          mealName: { type: Type.STRING, description: MEAL_NAME_DESC },
          mealId: { type: Type.STRING, description: MEAL_ID_DESC },
          date: { type: Type.STRING, description: DATE_DESC }
        },
        required: ['name', 'calories', 'protein', 'carbs', 'fat']
      }
    },
    {
      name: 'update_meal_item',
      description:
        "Change ONE existing planned food in a meal in place — its amount, name, or macros (e.g. \"make the rice 2 cups\", \"change the chicken to 8 oz\"). Identify the item by itemName (or itemId from get_meal_details). Provide only the fields that change.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          itemName: { type: Type.STRING, description: 'Current name of the food to change, e.g. "rice".' },
          itemId: { type: Type.STRING, description: 'Exact item id from get_meal_details, when known.' },
          name: { type: Type.STRING, description: 'New name for the food, if renaming it.' },
          quantity: { type: Type.NUMBER, description: 'New amount.' },
          unit: { type: Type.STRING, description: 'New unit.' },
          calories: { type: Type.NUMBER, description: 'New calories for the new quantity.' },
          protein: { type: Type.NUMBER, description: 'New protein grams.' },
          carbs: { type: Type.NUMBER, description: 'New carb grams.' },
          fat: { type: Type.NUMBER, description: 'New fat grams.' },
          mealName: { type: Type.STRING, description: MEAL_NAME_DESC },
          mealId: { type: Type.STRING, description: MEAL_ID_DESC },
          date: { type: Type.STRING, description: DATE_DESC }
        }
      }
    },
    {
      name: 'remove_meal_item',
      description:
        'Remove ONE food from an existing meal, leaving the rest (e.g. "take the toast off breakfast", "remove the fries"). Identify the item by itemName (or itemId from get_meal_details).',
      parameters: {
        type: Type.OBJECT,
        properties: {
          itemName: { type: Type.STRING, description: 'Name of the food to remove, e.g. "toast".' },
          itemId: { type: Type.STRING, description: 'Exact item id from get_meal_details, when known.' },
          mealName: { type: Type.STRING, description: MEAL_NAME_DESC },
          mealId: { type: Type.STRING, description: MEAL_ID_DESC },
          date: { type: Type.STRING, description: DATE_DESC }
        }
      }
    },
    {
      name: 'update_planned_meals',
      description:
        'Replace ALL planned items of one or more meals on a day (a full swap). Use only when the user gives a complete new list for the meal (e.g. "swap tomorrow\'s lunch for chicken, rice, and broccoli") or picks a suggested meal option. For a single food, prefer add_meal_item / update_meal_item / remove_meal_item. Do NOT use to rename (rename_meal) or retime (update_meal_time). Food already logged as eaten is never touched. If the user has meals that day and gave no explicit replacement list, confirm once first.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING, description: DATE_DESC },
          meals: {
            type: Type.ARRAY,
            description: 'Meals to set. Only the meals listed here change; other meals stay as they are.',
            items: {
              type: Type.OBJECT,
              properties: {
                mealName: { type: Type.STRING, description: MEAL_NAME_DESC },
                plannedTime: { type: Type.STRING, description: 'Optional 24h time, e.g. "13:00".' },
                items: {
                  type: Type.ARRAY,
                  description: 'The planned foods for this meal, replacing whatever was planned before.',
                  items: { type: Type.OBJECT, properties: ITEM_PROPS, required: ['name', 'calories', 'protein', 'carbs', 'fat'] }
                }
              },
              required: ['mealName', 'items']
            }
          }
        },
        required: ['date', 'meals']
      }
    },
    {
      name: 'rename_meal',
      description:
        'Rename an existing meal — changes only the title. Foods, macros, and time stay the same (e.g. "call breakfast \'Power Start\'"). Do NOT use for time changes (update_meal_time). Never claim a rename succeeded unless this tool returns a result.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          newName: { type: Type.STRING, description: 'The new meal title.' },
          currentName: { type: Type.STRING, description: 'Current meal title to rename, if known.' },
          mealId: { type: Type.STRING, description: MEAL_ID_DESC },
          date: { type: Type.STRING, description: DATE_DESC }
        },
        required: ['newName']
      }
    },
    {
      name: 'update_meal_time',
      description:
        'Change only the planned clock time of an existing meal (e.g. "move snack to 3pm", "change breakfast to 10am"). Does not rename the meal or change foods.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          plannedTime: { type: Type.STRING, description: 'New time as 10am, 10:00, 15:30, etc.' },
          mealName: { type: Type.STRING, description: MEAL_NAME_DESC },
          mealId: { type: Type.STRING, description: MEAL_ID_DESC },
          date: { type: Type.STRING, description: DATE_DESC }
        },
        required: ['plannedTime']
      }
    },
    {
      name: 'copy_meal_to_days',
      description:
        'Copy one meal\'s planned foods to other days (e.g. "make lunch the same all week", "use this dinner Mon and Wed"). Overwrites the same-named meal on each target day. Resolve target dates to YYYY-MM-DD from context.today.date.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          mealName: { type: Type.STRING, description: MEAL_NAME_DESC },
          mealId: { type: Type.STRING, description: MEAL_ID_DESC },
          date: { type: Type.STRING, description: 'The source day to copy FROM (YYYY-MM-DD). Defaults to today or the meal in focus.' },
          targetDates: {
            type: Type.ARRAY,
            description: 'The days to copy the meal TO, each YYYY-MM-DD.',
            items: { type: Type.STRING }
          }
        },
        required: ['targetDates']
      }
    }
  ];
}

function toFocus(ctx: MealToolContext): MealRenameFocus | null {
  const target = ctx.mealEditFocus ?? ctx.activeMeal;
  if (!target) return null;
  return { mealName: target.mealName, mealId: target.mealId, date: target.date };
}

/** Merges the meal-edit/active-meal target ids and date into raw tool args so single edits are pinned. */
function withTarget(ctx: MealToolContext, args: Record<string, unknown>): Record<string, unknown> {
  const target = ctx.mealEditFocus ?? ctx.activeMeal;
  if (!target) return args;
  return {
    ...args,
    ...(typeof args.mealId === 'string' && args.mealId.trim() ? {} : target.mealId ? { mealId: target.mealId } : {}),
    ...(typeof args.date === 'string' && args.date.trim() ? {} : { date: target.date }),
    ...(typeof args.mealName === 'string' && args.mealName.trim() ? {} : { mealName: target.mealName })
  };
}

function planError(error: unknown, fallback: string): Record<string, unknown> {
  if (error instanceof PlanEditError) return { error: error.message };
  return { error: error instanceof Error ? error.message : fallback };
}

/**
 * Executes a meal-management tool. Returns null when `name` is not a meal tool so the caller can
 * fall through to its own tools. Shared by the web coach and the SMS coach.
 */
export async function executeMealTool(
  ctx: MealToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (!MEAL_MANAGEMENT_TOOLS.has(name)) return null;
  const focus = toFocus(ctx);

  switch (name) {
    case 'get_meal_details': {
      try {
        const result = await handleMealDetails(
          ctx.userId,
          ctx.dateKey,
          ctx.timeZone,
          typeof args.meal === 'string' && args.meal.trim() ? args.meal.trim() : ctx.mealEditFocus?.mealName ?? ctx.activeMeal?.mealName,
          typeof args.date === 'string' && args.date.trim() ? args.date.trim() : ctx.mealEditFocus?.date ?? ctx.activeMeal?.date
        );
        ctx.toolCalls.push({ name, args });
        return { result };
      } catch (error) {
        return planError(error, 'Could not look up that meal.');
      }
    }

    case 'create_meal': {
      try {
        const created = await applyCreateMeal(ctx.userId, ctx.timeZone, args);
        ctx.toolCalls.push({ name, args: { mealName: created.mealName, date: created.date, mealId: created.mealId } });
        return { result: created.result, meal: created };
      } catch (error) {
        return planError(error, 'Could not create that meal.');
      }
    }

    case 'delete_meal': {
      try {
        const deleted = await applyDeleteMeal(ctx.userId, ctx.timeZone, withTarget(ctx, args), focus);
        ctx.toolCalls.push({ name, args: { mealId: deleted.mealId, mealName: deleted.mealName, date: deleted.date } });
        return { result: deleted.result, mealId: deleted.mealId, mealName: deleted.mealName };
      } catch (error) {
        return planError(error, 'Could not delete that meal.');
      }
    }

    case 'add_meal_item': {
      try {
        const state = await applyAddMealItem(ctx.userId, ctx.timeZone, withTarget(ctx, args), focus);
        ctx.toolCalls.push({ name, args: { mealId: state.mealId, name: args.name } });
        return { result: state.result, meal: state };
      } catch (error) {
        return planError(error, 'Could not add that item.');
      }
    }

    case 'update_meal_item': {
      try {
        const state = await applyUpdateMealItem(ctx.userId, ctx.timeZone, withTarget(ctx, args), focus);
        ctx.toolCalls.push({ name, args: { mealId: state.mealId } });
        return { result: state.result, meal: state };
      } catch (error) {
        return planError(error, 'Could not update that item.');
      }
    }

    case 'remove_meal_item': {
      try {
        const state = await applyRemoveMealItem(ctx.userId, ctx.timeZone, withTarget(ctx, args), focus);
        ctx.toolCalls.push({ name, args: { mealId: state.mealId } });
        return { result: state.result, meal: state };
      } catch (error) {
        return planError(error, 'Could not remove that item.');
      }
    }

    case 'update_planned_meals': {
      try {
        const focusedArgs = pinPlannedMealArgs(ctx, args);
        const result = await applyPlannedMealUpdate(ctx.userId, ctx.timeZone, focusedArgs);
        ctx.toolCalls.push({ name, args: focusedArgs });
        return { result };
      } catch (error) {
        return planError(error, 'Could not update the planned meals.');
      }
    }

    case 'rename_meal': {
      try {
        const newName = typeof args.newName === 'string' ? args.newName : '';
        const renameArgs = {
          newName,
          ...(typeof args.currentName === 'string' ? { currentName: args.currentName } : {}),
          ...(typeof args.mealId === 'string' ? { mealId: args.mealId } : focus?.mealId ? { mealId: focus.mealId } : {}),
          ...(typeof args.date === 'string' ? { date: args.date } : focus?.date ? { date: focus.date } : {})
        };
        const renamed = await applyMealRename(ctx.userId, ctx.timeZone, renameArgs, focus);
        ctx.toolCalls.push({ name, args: { mealId: renamed.mealId, previousName: renamed.previousName, newName: renamed.newName } });
        if (ctx.mealEditFocus && (!ctx.mealEditFocus.mealId || ctx.mealEditFocus.mealId === renamed.mealId)) {
          ctx.mealEditFocus.mealName = renamed.newName;
          ctx.mealEditFocus.mealId = renamed.mealId;
        }
        if (ctx.activeMeal && ctx.activeMeal.mealId === renamed.mealId) ctx.activeMeal.mealName = renamed.newName;
        return { result: renamed.result, mealId: renamed.mealId, newName: renamed.newName };
      } catch (error) {
        return planError(error, 'Could not rename that meal.');
      }
    }

    case 'update_meal_time': {
      try {
        const plannedTime = typeof args.plannedTime === 'string' ? args.plannedTime : '';
        const timeArgs = {
          plannedTime,
          ...(typeof args.mealName === 'string' ? { mealName: args.mealName } : {}),
          ...(typeof args.mealId === 'string' ? { mealId: args.mealId } : focus?.mealId ? { mealId: focus.mealId } : {}),
          ...(typeof args.date === 'string' ? { date: args.date } : focus?.date ? { date: focus.date } : {})
        };
        const updated = await applyMealTimeChange(ctx.userId, ctx.timeZone, timeArgs, focus);
        ctx.toolCalls.push({ name, args: { mealId: updated.mealId, mealName: updated.mealName, plannedTime: updated.plannedTime } });
        return { result: updated.result, mealId: updated.mealId, plannedTime: updated.plannedTime, mealName: updated.mealName };
      } catch (error) {
        return planError(error, 'Could not update that meal time.');
      }
    }

    case 'copy_meal_to_days': {
      try {
        const copied = await applyCopyMealToDays(ctx.userId, ctx.timeZone, withTarget(ctx, args), focus);
        ctx.toolCalls.push({ name, args: { mealName: copied.mealName, sourceDate: copied.sourceDate, targetDates: copied.targetDates } });
        return { result: copied.result, targetDates: copied.targetDates };
      } catch (error) {
        return planError(error, 'Could not copy that meal.');
      }
    }

    default:
      return { error: `Unknown meal tool: ${name}` };
  }
}

/** When editing/reviewing a specific meal, force update_planned_meals onto that meal so it can't drift. */
function pinPlannedMealArgs(ctx: MealToolContext, args: Record<string, unknown>): Record<string, unknown> {
  const target = ctx.mealEditFocus ?? ctx.activeMeal;
  if (!target) return args;
  const focusName = target.mealName.trim().toLowerCase();
  const rawMeals = Array.isArray(args.meals) ? args.meals : [];
  const matched =
    rawMeals.find((meal) => {
      if (!meal || typeof meal !== 'object') return false;
      const mealName = (meal as Record<string, unknown>).mealName;
      return typeof mealName === 'string' && mealName.trim().toLowerCase() === focusName;
    }) ??
    rawMeals.find((meal) => meal && typeof meal === 'object') ??
    null;
  const entry = matched && typeof matched === 'object' ? (matched as Record<string, unknown>) : null;
  return {
    date: target.date,
    meals: [
      {
        mealName: target.mealName,
        ...(target.mealId ? { mealId: target.mealId } : {}),
        ...(typeof entry?.plannedTime === 'string' ? { plannedTime: entry.plannedTime } : {}),
        items: Array.isArray(entry?.items) ? entry.items : []
      }
    ]
  };
}
