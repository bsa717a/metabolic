export const APPLE_SUBSCRIPTION_GROUP = 'metabolic_digital';

export const APPLE_IAP_PRODUCTS = {
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

export type AppleIapPlanId = keyof typeof APPLE_IAP_PRODUCTS;

export const APPLE_IAP_PRODUCT_IDS = Object.values(APPLE_IAP_PRODUCTS).map((product) => product.productId);

export function appleProductIdForPlan(plan: string): string | null {
  if (plan === 'self_guided' || plan === 'plus') return APPLE_IAP_PRODUCTS[plan].productId;
  return null;
}

export function planForAppleProductId(productId: string): AppleIapPlanId | null {
  const match = (Object.keys(APPLE_IAP_PRODUCTS) as AppleIapPlanId[]).find(
    (plan) => APPLE_IAP_PRODUCTS[plan].productId === productId
  );
  return match ?? null;
}

export function appleFallbackPrice(plan: string): string | null {
  if (plan === 'self_guided' || plan === 'plus') return `${APPLE_IAP_PRODUCTS[plan].fallbackPrice}/month`;
  return null;
}
