import type { Role } from '@prisma/client';
import { canAccessUser } from '../auth/requireRole.js';
import { prisma } from '../db/prisma.js';
import { parseDateParam, toDateKey } from '../utils/dates.js';

export const MEAL_NOTE_MAX_LENGTH = 2000;
/** Inclusive span cap so a year-long export stays a single indexed read. */
export const MEAL_NOTE_MAX_RANGE_DAYS = 370;

export type MealNoteRecord = {
  date: string;
  mealNumber: number;
  note: string;
};

export class MealNoteError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'MealNoteError';
    this.statusCode = statusCode;
  }
}

function assertRange(from: string, to: string) {
  const start = parseDateParam(from);
  const end = parseDateParam(to);
  if (end < start) throw new MealNoteError('Date range is invalid', 400);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (days > MEAL_NOTE_MAX_RANGE_DAYS) throw new MealNoteError('Date range is too long', 400);
  return { start, end };
}

async function loadMeal(mealId: string) {
  return prisma.meal.findUnique({
    where: { id: mealId },
    select: {
      id: true,
      userId: true,
      mealNumber: true,
      dailyLog: { select: { date: true } }
    }
  });
}

/**
 * Notes for one client across an inclusive UTC date range, ordered by day then meal number.
 * A later weekly PDF can call this for a Notes column. Callers must authorize first.
 */
export async function listMealNotesInRange(userId: string, from: string, to: string): Promise<MealNoteRecord[]> {
  const { start, end } = assertRange(from, to);
  const rows = await prisma.mealNote.findMany({
    where: { userId, date: { gte: start, lte: end } },
    orderBy: [{ date: 'asc' }, { mealNumber: 'asc' }],
    select: { date: true, mealNumber: true, note: true }
  });
  return rows.map((row) => ({
    date: toDateKey(row.date),
    mealNumber: row.mealNumber,
    note: row.note
  }));
}

export async function listMealNotesForActor(
  actor: { id: string; role: Role },
  userId: string,
  from: string,
  to: string
) {
  if (!(await canAccessUser(actor, userId))) throw new MealNoteError('Not found', 404);
  const notes = await listMealNotesInRange(userId, from, to);
  return { notes };
}

export async function getMealClientNote(actor: { id: string; role: Role }, mealId: string) {
  const meal = await loadMeal(mealId);
  if (!meal || !(await canAccessUser(actor, meal.userId))) throw new MealNoteError('Meal not found', 404);
  const row = await prisma.mealNote.findUnique({
    where: {
      userId_date_mealNumber: {
        userId: meal.userId,
        date: meal.dailyLog.date,
        mealNumber: meal.mealNumber
      }
    },
    select: { note: true }
  });
  return {
    mealId: meal.id,
    date: toDateKey(meal.dailyLog.date),
    mealNumber: meal.mealNumber,
    note: row?.note ?? null
  };
}

/** Only the meal's client may write. Coaches and admins who can read the client get 403. */
export async function setMealClientNote(actor: { id: string; role: Role }, mealId: string, note: string) {
  const meal = await loadMeal(mealId);
  if (!meal) throw new MealNoteError('Meal not found', 404);
  if (actor.id !== meal.userId) {
    if (await canAccessUser(actor, meal.userId)) {
      throw new MealNoteError('Only the client can edit meal notes', 403);
    }
    throw new MealNoteError('Meal not found', 404);
  }

  const trimmed = note.trim();
  const key = {
    userId: meal.userId,
    date: meal.dailyLog.date,
    mealNumber: meal.mealNumber
  };

  if (!trimmed) {
    await prisma.mealNote.deleteMany({ where: key });
    return {
      mealId: meal.id,
      date: toDateKey(meal.dailyLog.date),
      mealNumber: meal.mealNumber,
      note: null
    };
  }

  if (trimmed.length > MEAL_NOTE_MAX_LENGTH) {
    throw new MealNoteError(`Note must be ${MEAL_NOTE_MAX_LENGTH} characters or fewer`, 400);
  }

  await prisma.mealNote.upsert({
    where: { userId_date_mealNumber: key },
    create: { ...key, note: trimmed },
    update: { note: trimmed }
  });

  return {
    mealId: meal.id,
    date: toDateKey(meal.dailyLog.date),
    mealNumber: meal.mealNumber,
    note: trimmed
  };
}

export async function withClientNotes<T extends { mealNumber: number }>(userId: string, date: Date, meals: T[]) {
  if (!meals.length) return meals.map((meal) => ({ ...meal, clientNote: null as string | null }));
  const notes = await prisma.mealNote.findMany({
    where: { userId, date, mealNumber: { in: meals.map((meal) => meal.mealNumber) } },
    select: { mealNumber: true, note: true }
  });
  const byNumber = new Map(notes.map((row) => [row.mealNumber, row.note]));
  return meals.map((meal) => ({ ...meal, clientNote: byNumber.get(meal.mealNumber) ?? null }));
}
