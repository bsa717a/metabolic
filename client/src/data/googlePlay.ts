export const GOOGLE_PLAY_PRODUCTS = {
  self_guided: {
    plan: 'self_guided' as const,
    productId: 'com.mastermetabolic.app.plan.self_guided.monthly',
    displayName: 'Self-Guided Metabolic',
    interval: 'month' as const,
    fallbackPrice: '$19.99'
  },
  plus: {
    plan: 'plus' as const,
    productId: 'com.mastermetabolic.app.plan.plus.monthly',
    displayName: 'Metabolic Plus',
    interval: 'month' as const,
    fallbackPrice: '$59.99'
  }
} as const;

export type GooglePlayPlanId = keyof typeof GOOGLE_PLAY_PRODUCTS;

export const GOOGLE_PLAY_PRODUCT_IDS = Object.values(GOOGLE_PLAY_PRODUCTS).map((product) => product.productId);

export function googleProductIdForPlan(plan: string): string | null {
  if (plan === 'self_guided' || plan === 'plus') return GOOGLE_PLAY_PRODUCTS[plan].productId;
  return null;
}

export function googleFallbackPrice(plan: string): string | null {
  if (plan === 'self_guided' || plan === 'plus') return `${GOOGLE_PLAY_PRODUCTS[plan].fallbackPrice}/month`;
  return null;
}
