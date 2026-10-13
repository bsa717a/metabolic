import { MealItemType } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { addUtcDays, parseDateParam, toDateKey, userDayKey, weekdayIndexFromDate } from '../utils/dates.js';
import { n } from '../utils/numbers.js';
import { isEmailConfigured } from './emailTransport.js';
import { sendSessionRecapEmail } from './emailService.js';
import { getRoutineForUser } from './exerciseRoutineService.js';
import { getMealsForDate } from './nutritionService.js';
import {
  buildSessionRecapEmail,
  type SessionRecapMeal,
  type SessionRecapRoutineDay
} from './sessionRecapEmail.js';

export type SessionRecapSendResult = {
  sent: boolean;
  to?: string;
  error?: string;
};

export async function sendCoachSessionRecapEmail(
  actor: { id: string; firstName: string; lastName: string },
  userId: string,
  notes: string
): Promise<SessionRecapSendResult> {
  if (!isEmailConfigured()) {
    return { sent: false };
  }

  try {
    const client = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, firstName: true, timezone: true }
    });

    const todayKey = userDayKey(client.timezone);
    const tomorrowDateKey = toDateKey(addUtcDays(parseDateParam(todayKey), 1));
    const coachName = `${actor.firstName} ${actor.lastName}`.trim() || 'Your coach';
    const baseUrl = env.CLIENT_URL.replace(/\/$/, '');

    const [nextMeeting, meals, routine] = await Promise.all([
      prisma.coachCheckIn.findFirst({
        where: { coachId: actor.id, userId, startsAt: { gt: new Date() } },
        orderBy: { startsAt: 'asc' },
        select: { startsAt: true }
      }),
      getMealsForDate(userId, tomorrowDateKey),
      getRoutineForUser(userId)
    ]);

    const tomorrowMeals: SessionRecapMeal[] = meals.map((meal) => ({
      name: meal.name,
      plannedTime: meal.plannedTime,
      calories: n(meal.plannedCalories),
      protein: n(meal.plannedProtein),
      carbs: n(meal.plannedCarbs),
      fat: n(meal.plannedFat),
      items: meal.items
        .filter((item) => item.type === MealItemType.PLANNED)
        .map((item) => ({
          name: item.nameSnapshot,
          quantity: n(item.quantity),
          unit: item.unit
        }))
    }));

    const weekRoutine: SessionRecapRoutineDay[] = (routine?.days ?? [])
      .slice()
      .sort((a, b) => a.weekday - b.weekday)
      .map((day) => ({
        weekday: day.weekday,
        workoutName: day.template?.name ?? null
      }));

    const tomorrowWeekday = weekdayIndexFromDate(parseDateParam(tomorrowDateKey));
    const tomorrowWorkoutName =
      weekRoutine.find((day) => day.weekday === tomorrowWeekday)?.workoutName?.trim() || null;

    const email = buildSessionRecapEmail({
      clientFirstName: client.firstName,
      coachName,
      notes,
      nextMeetingAt: nextMeeting?.startsAt ?? null,
      timeZone: client.timezone,
      tomorrowDateKey,
      tomorrowMeals,
      weekRoutine,
      tomorrowWorkoutName,
      links: {
        dashboard: baseUrl,
        nutrition: `${baseUrl}/nutrition`,
        exercise: `${baseUrl}/exercise`
      }
    });

    await sendSessionRecapEmail({ to: client.email, ...email });
    return { sent: true, to: client.email };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send session recap email';
    return { sent: false, error: message };
  }
}
