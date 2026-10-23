import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const routes = readFileSync(new URL('../routes/storeRoutes.ts', import.meta.url), 'utf8');
const checkout = readFileSync(new URL('./storeCheckoutService.ts', import.meta.url), 'utf8');
const cart = readFileSync(new URL('../../../client/src/components/store/CartDrawer.tsx', import.meta.url), 'utf8');
const googleRoutes = readFileSync(new URL('../routes/googlePlayRoutes.ts', import.meta.url), 'utf8');

describe('/store stays on Stripe', () => {
  it('still creates a Stripe Checkout session for physical goods', () => {
    assert.match(routes, /\/api\/store\/checkout/);
    assert.match(routes, /createCheckoutSession/);
    assert.match(routes, /isStripeConfigured/);
    assert.match(checkout, /checkout\.sessions\.create/);
    assert.match(checkout, /stripeCheckoutSessionId/);
    assert.match(cart, /\/api\/store\/checkout/);
    assert.doesNotMatch(routes, /googlePlay|Play Billing|obfuscatedAccountId|subscriptionsv2/);
    assert.doesNotMatch(checkout, /googlePlay|Play Billing|obfuscatedAccountId|subscriptionsv2/);
    assert.doesNotMatch(cart, /billing\/google|PlayBilling|obfuscatedAccountId/);
  });

  it('does not sell store checkout through the Play Billing routes', () => {
    assert.match(googleRoutes, /\/api\/billing\/google\/purchases/);
    assert.doesNotMatch(googleRoutes, /\/api\/store\/checkout/);
    assert.doesNotMatch(googleRoutes, /createCheckoutSession/);
  });
});
