import { PlanTier } from '@prisma/client';

/** App Store subscription group. Products are not sold outside this group. */
export const APPLE_SUBSCRIPTION_GROUP = 'metabolic_digital';

export const APPLE_BUNDLE_ID = 'com.mastermetabolic.app';

export const APPLE_PRODUCT_SELF_GUIDED_MONTHLY = 'com.mastermetabolic.app.plan.self_guided.monthly';
export const APPLE_PRODUCT_PLUS_MONTHLY = 'com.mastermetabolic.app.plan.plus.monthly';

export const APPLE_IAP_PRODUCTS = {
  self_guided: {
    plan: PlanTier.SELF_GUIDED,
    slug: 'self_guided' as const,
    productId: APPLE_PRODUCT_SELF_GUIDED_MONTHLY,
    displayName: 'Self-Guided Metabolic',
    interval: 'month' as const,
    appStorePriceUsd: '19.99'
  },
  plus: {
    plan: PlanTier.PLUS,
    slug: 'plus' as const,
    productId: APPLE_PRODUCT_PLUS_MONTHLY,
    displayName: 'Metabolic Plus',
    interval: 'month' as const,
    appStorePriceUsd: '59.99'
  }
} as const;

export type AppleIapPlanSlug = keyof typeof APPLE_IAP_PRODUCTS;

const PRODUCT_TO_PLAN: Record<string, PlanTier> = {
  [APPLE_PRODUCT_SELF_GUIDED_MONTHLY]: PlanTier.SELF_GUIDED,
  [APPLE_PRODUCT_PLUS_MONTHLY]: PlanTier.PLUS
};

const PLAN_TO_PRODUCT: Partial<Record<PlanTier, string>> = {
  [PlanTier.SELF_GUIDED]: APPLE_PRODUCT_SELF_GUIDED_MONTHLY,
  [PlanTier.PLUS]: APPLE_PRODUCT_PLUS_MONTHLY
};

const TIER_RANK: Record<PlanTier, number> = {
  [PlanTier.STARTER]: 0,
  [PlanTier.SELF_GUIDED]: 1,
  [PlanTier.PLUS]: 2,
  [PlanTier.COACH_LED]: 3
};

export function appleIapProductIds(): string[] {
  return Object.values(APPLE_IAP_PRODUCTS).map((product) => product.productId);
}

export function mapProductIdToPlan(productId: string): PlanTier | null {
  return PRODUCT_TO_PLAN[productId] ?? null;
}

export function mapPlanToProductId(plan: PlanTier): string | null {
  return PLAN_TO_PRODUCT[plan] ?? null;
}

export function isAppleIapProductId(productId: string): boolean {
  return mapProductIdToPlan(productId) !== null;
}

export function higherPlan(a: PlanTier, b: PlanTier): PlanTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export function rankPlan(plan: PlanTier): number {
  return TIER_RANK[plan];
}
