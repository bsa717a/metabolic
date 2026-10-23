import { PlanTier } from '@prisma/client';

export const GOOGLE_PLAY_PACKAGE_NAME = 'com.mastermetabolic.app';

export const GOOGLE_PLAY_PRODUCT_SELF_GUIDED_MONTHLY = 'com.mastermetabolic.app.plan.self_guided.monthly';
export const GOOGLE_PLAY_PRODUCT_PLUS_MONTHLY = 'com.mastermetabolic.app.plan.plus.monthly';

/** Digital plans only. Physical /store products stay on Stripe. */
export const GOOGLE_PLAY_PRODUCTS = {
  self_guided: {
    plan: PlanTier.SELF_GUIDED,
    slug: 'self_guided' as const,
    productId: GOOGLE_PLAY_PRODUCT_SELF_GUIDED_MONTHLY,
    displayName: 'Self-Guided Metabolic',
    interval: 'month' as const,
    playPriceUsd: '19.99'
  },
  plus: {
    plan: PlanTier.PLUS,
    slug: 'plus' as const,
    productId: GOOGLE_PLAY_PRODUCT_PLUS_MONTHLY,
    displayName: 'Metabolic Plus',
    interval: 'month' as const,
    playPriceUsd: '59.99'
  }
} as const;

export type GooglePlayPlanSlug = keyof typeof GOOGLE_PLAY_PRODUCTS;

const PRODUCT_TO_PLAN: Record<string, PlanTier> = {
  [GOOGLE_PLAY_PRODUCT_SELF_GUIDED_MONTHLY]: PlanTier.SELF_GUIDED,
  [GOOGLE_PLAY_PRODUCT_PLUS_MONTHLY]: PlanTier.PLUS
};

const TIER_RANK: Record<PlanTier, number> = {
  [PlanTier.STARTER]: 0,
  [PlanTier.SELF_GUIDED]: 1,
  [PlanTier.PLUS]: 2,
  [PlanTier.COACH_LED]: 3
};

export function googlePlayProductIds(): string[] {
  return Object.values(GOOGLE_PLAY_PRODUCTS).map((product) => product.productId);
}

export function mapProductIdToPlan(productId: string): PlanTier | null {
  return PRODUCT_TO_PLAN[productId] ?? null;
}

export function isGooglePlayProductId(productId: string): boolean {
  return mapProductIdToPlan(productId) !== null;
}

export function rankPlan(plan: PlanTier): number {
  return TIER_RANK[plan];
}
