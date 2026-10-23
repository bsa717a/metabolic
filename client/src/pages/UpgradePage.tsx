import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { api } from '../services/api';
import { loadAppleIapProducts, purchaseApplePlan, restoreApplePurchases, type AppleIapProduct } from '../services/appleIap';
import {
  loadGooglePlayProducts,
  purchaseGooglePlan,
  restoreGooglePurchases,
  type GooglePlayProduct
} from '../services/googlePlay';
import { PlanComparisonModal } from '../components/entitlements/PlanComparisonModal';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { appleFallbackPrice, appleProductIdForPlan } from '../data/appleIap';
import { googleFallbackPrice, googleProductIdForPlan } from '../data/googlePlay';
import { PUBLIC_PLANS } from '../data/plans';
import type { AppUser, PlanSlug } from '../types';
import { getRequiredPlan, planLabel } from '../utils/entitlements';
import { WEEKLY_PLAN_BILLING_PARAM, weeklyPlanUnlockName } from '../utils/homePlanStatus';
import { ANDROID_PLAN_MANAGE_COPY, usesAppleIapCheckout, usesGooglePlayCheckout } from '../utils/nativePlatform';

type ListedProduct = {
  id: string;
  displayPrice: string;
  subscriptionPeriodUnit: string;
};

function listedFromApple(products: AppleIapProduct[]): ListedProduct[] {
  return products.map((product) => ({
    id: product.id,
    displayPrice: product.displayPrice,
    subscriptionPeriodUnit: product.subscriptionPeriodUnit
  }));
}

function listedFromGoogle(products: GooglePlayProduct[]): ListedProduct[] {
  return products.map((product) => ({
    id: product.id,
    displayPrice: product.displayPrice,
    subscriptionPeriodUnit: product.subscriptionPeriodUnit
  }));
}

export function UpgradePage({
  user,
  onUserUpdated
}: {
  user: AppUser | null;
  onUserUpdated?: (user: AppUser) => void;
}) {
  const [searchParams] = useSearchParams();
  const showWeeklyPlanUnlock = searchParams.get(WEEKLY_PLAN_BILLING_PARAM) === '1';
  const weeklyPlanName = weeklyPlanUnlockName();
  const weeklyPlanId = getRequiredPlan('weekly_nutrition_plan');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState<PlanSlug | 'restore' | null>(null);
  const [showPlanComparison, setShowPlanComparison] = useState(false);
  const [storeProducts, setStoreProducts] = useState<ListedProduct[]>([]);
  const currentPlan = user?.plan ?? 'starter';
  const useAppleCheckout = usesAppleIapCheckout();
  const useGoogleCheckout = usesGooglePlayCheckout();
  const useStoreCheckout = useAppleCheckout || useGoogleCheckout;

  useEffect(() => {
    if (useAppleCheckout) {
      void loadAppleIapProducts()
        .then((products) => setStoreProducts(listedFromApple(products)))
        .catch(() => setStoreProducts([]));
      return;
    }
    if (useGoogleCheckout) {
      void loadGooglePlayProducts()
        .then((products) => setStoreProducts(listedFromGoogle(products)))
        .catch(() => setStoreProducts([]));
    }
  }, [useAppleCheckout, useGoogleCheckout]);

  const productsByPlan = useMemo(() => {
    const map = new Map<string, ListedProduct>();
    for (const product of storeProducts) {
      const plan = PUBLIC_PLANS.find((item) => {
        const productId = useGoogleCheckout ? googleProductIdForPlan(item.id) : appleProductIdForPlan(item.id);
        return productId === product.id;
      });
      if (plan) map.set(plan.id, product);
    }
    return map;
  }, [storeProducts, useGoogleCheckout]);

  function priceFor(planId: string) {
    const listed = productsByPlan.get(planId);
    if (listed?.displayPrice) {
      return listed.subscriptionPeriodUnit === 'month' ? `${listed.displayPrice}/month` : listed.displayPrice;
    }
    if (useGoogleCheckout) return googleFallbackPrice(planId) ?? PUBLIC_PLANS.find((plan) => plan.id === planId)?.price;
    if (useAppleCheckout) return appleFallbackPrice(planId) ?? PUBLIC_PLANS.find((plan) => plan.id === planId)?.price;
    return PUBLIC_PLANS.find((plan) => plan.id === planId)?.price;
  }

  async function requestWebCheckout(plan: 'self_guided' | 'plus') {
    setLoading(plan);
    setMessage('');
    try {
      const result = await api<{ message: string }>('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ plan })
      });
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start checkout');
    } finally {
      setLoading(null);
    }
  }

  async function requestAppleCheckout(plan: 'self_guided' | 'plus') {
    setLoading(plan);
    setMessage('');
    try {
      const nextUser = await purchaseApplePlan(plan);
      if (!nextUser) {
        setMessage('Purchase canceled.');
        return;
      }
      onUserUpdated?.(nextUser);
      setMessage(`You're now on ${planLabel(nextUser.plan)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to complete the Apple purchase');
    } finally {
      setLoading(null);
    }
  }

  async function requestGoogleCheckout(plan: 'self_guided' | 'plus') {
    setLoading(plan);
    setMessage('');
    try {
      const nextUser = await purchaseGooglePlan(plan);
      if (!nextUser) {
        setMessage('Purchase canceled.');
        return;
      }
      onUserUpdated?.(nextUser);
      setMessage(`You're now on ${planLabel(nextUser.plan)}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to complete the Google Play purchase');
    } finally {
      setLoading(null);
    }
  }

  async function restorePurchases() {
    setLoading('restore');
    setMessage('');
    try {
      const nextUser = useGoogleCheckout ? await restoreGooglePurchases() : await restoreApplePurchases();
      if (nextUser) onUserUpdated?.(nextUser);
      const storeName = useGoogleCheckout ? 'Google Play' : 'Apple';
      setMessage(nextUser ? `Restored ${planLabel(nextUser.plan)}.` : `No ${storeName} subscriptions to restore.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to restore purchases');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-navy dark:text-brand-off-white">Your plan</h1>
        <p className="mt-2 text-app-text-muted">
          You&apos;re on <strong>{planLabel(currentPlan)}</strong>.
          {user?.gracePeriodEndsAt ? (
            <>
              {' '}
              Your coach-led grace period ends{' '}
              {new Date(user.gracePeriodEndsAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric'
              })}
              . Choose a plan to continue afterward.
            </>
          ) : null}
        </p>
      </div>

      {showWeeklyPlanUnlock ? (
        <p className="rounded-2xl border border-brand-green/30 bg-brand-green/10 px-4 py-3 text-sm text-app-text">
          <span className="font-bold">{weeklyPlanName}</span> unlocks a weekly plan.
        </p>
      ) : null}

      {user?.gracePeriodEndsAt && user.nextPlanAfterCoach ? (
        <Card className="border-brand-gold/40 bg-brand-gold/10 p-4 text-sm">
          After your grace period, you&apos;ll move to {planLabel(user.nextPlanAfterCoach)} unless you choose
          something else first.
        </Card>
      ) : null}

      <div className="grid gap-6 md:grid-cols-3">
        {PUBLIC_PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id || (currentPlan === 'coach_led' && plan.id === 'plus');
          return (
            <Card
              key={plan.id}
              className={`flex flex-col p-6 ${plan.recommended ? 'border-brand-green ring-2 ring-brand-green/20' : ''}`}
            >
              {plan.recommended ? (
                <span className="mb-2 inline-block w-fit rounded-full bg-brand-green/15 px-2 py-0.5 text-xs font-semibold text-brand-green">
                  Recommended
                </span>
              ) : null}
              <h2 className="text-lg font-bold">{plan.name}</h2>
              {showWeeklyPlanUnlock && plan.id === weeklyPlanId ? (
                <p className="mt-1 text-sm font-semibold text-brand-green">Unlocks a weekly plan</p>
              ) : null}
              <p className="text-2xl font-bold text-brand-green">{priceFor(plan.id)}</p>
              <ul className="mt-4 flex-1 space-y-2">
                {plan.bullets.slice(0, 5).map((bullet) => (
                  <li key={bullet} className="flex gap-2 text-sm text-app-text-muted">
                    <Check className="shrink-0 text-brand-green" size={14} aria-hidden />
                    {bullet}
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                {isCurrent ? (
                  <Button className="w-full" variant="secondary" disabled>
                    Current plan
                  </Button>
                ) : plan.id === 'starter' ? (
                  <p className="text-center text-xs text-app-text-muted">Contact support to downgrade</p>
                ) : (
                  <Button
                    className="w-full"
                    disabled={loading !== null}
                    onClick={() =>
                      void (useGoogleCheckout
                        ? requestGoogleCheckout(plan.id as 'self_guided' | 'plus')
                        : useAppleCheckout
                          ? requestAppleCheckout(plan.id as 'self_guided' | 'plus')
                          : requestWebCheckout(plan.id as 'self_guided' | 'plus'))
                    }
                  >
                    {loading === plan.id ? 'Loading…' : useStoreCheckout ? 'Subscribe' : 'Choose plan'}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {useStoreCheckout ? (
        <div className="space-y-3">
          <Button variant="secondary" disabled={loading !== null} onClick={() => void restorePurchases()}>
            {loading === 'restore' ? 'Restoring…' : 'Restore purchases'}
          </Button>
          {useGoogleCheckout ? (
            <p className="text-xs text-app-text-muted">
              Payment is charged to your Google Play account. Subscriptions renew monthly unless you cancel at least
              24 hours before the period ends. {ANDROID_PLAN_MANAGE_COPY}{' '}
              <Link className="underline" to="/privacy">
                Privacy Policy
              </Link>
              .
            </p>
          ) : (
            <p className="text-xs text-app-text-muted">
              Payment is charged to your Apple ID. Subscriptions renew monthly unless you cancel at least 24 hours
              before the period ends. Manage or cancel in Settings → Apple ID → Subscriptions.{' '}
              <Link className="underline" to="/privacy">
                Privacy Policy
              </Link>
              {' · '}
              <a
                className="underline"
                href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
                rel="noreferrer"
                target="_blank"
              >
                Terms of Use (EULA)
              </a>
              .
            </p>
          )}
        </div>
      ) : null}

      {message ? <p className="text-sm text-app-text-muted">{message}</p> : null}

      <p className="text-sm text-app-text-muted">
        <button
          type="button"
          className="text-brand-green underline"
          onClick={() => setShowPlanComparison(true)}
        >
          Compare all plan details
        </button>
      </p>

      <PlanComparisonModal open={showPlanComparison} onClose={() => setShowPlanComparison(false)} />
    </div>
  );
}
