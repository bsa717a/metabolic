import Stripe from 'stripe';
import { env } from '../config/env.js';

let cachedStripe: Stripe | null = null;

export function isStripeConfigured() {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in server/.env.');
  }
  if (!cachedStripe) {
    cachedStripe = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return cachedStripe;
}
