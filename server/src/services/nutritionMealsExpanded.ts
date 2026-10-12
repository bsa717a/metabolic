import { z } from 'zod';
import { prisma } from '../db/prisma.js';

export const nutritionMealsExpandedBody = z.object({
  expanded: z.boolean()
});

export async function setNutritionMealsExpanded(userId: string, expanded: boolean) {
  return prisma.user.update({
    where: { id: userId },
    data: { nutritionMealsExpanded: expanded }
  });
}
