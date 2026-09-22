import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { api } from '../services/api';
import { loadAppleIapProducts, purchaseApplePlan, restoreApplePurchases, type AppleIapProduct } from '../services/appleIap';
import { PlanComparisonModal } from '../components/entitlements/PlanComparisonModal';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { appleFallbackPrice, appleProductIdForPlan } from '../data/appleIap';
import { PUBLIC_PLANS } from '../data/plans';
import type { AppUser, PlanSlug } from '../types';
import { planLabel } from '../utils/entitlements';
import { usesAppleIapCheckout } from '../utils/nativePlatform';

export function UpgradePage({
  user,
  onUserUpdated
}: {
  user: AppUser | null;
  onUserUpdated?: (user: AppUser) => void;
}) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState<PlanSlug | 'restore' | null>(null);
  const [showPlanComparison, setShowPlanComparison] = useState(false);
  const [appleProducts, setAppleProducts] = useState<AppleIapProduct[]>([]);
  const currentPlan = user?.plan ?? 'starter';
  const useAppleCheckout = usesAppleIapCheckout();

  useEffect(() => {
    if (!useAppleCheckout) return;
    void loadAppleIapProducts()
      .then(setAppleProducts)
      .catch(() => setAppleProducts([]));
  }, [useAppleCheckout]);

  const productsByPlan = useMemo(() => {
    const map = new Map<string, AppleIapProduct>();
    for (const product of appleProducts) {
      const plan = PUBLIC_PLANS.find((item) => appleProductIdForPlan(item.id) === product.id);
      if (plan) map.set(plan.id, product);
    }
    return map;
  }, [appleProducts]);

  function priceFor(planId: string) {
    const storeKit = productsByPlan.get(planId);
    if (storeKit?.displayPrice) {
      return storeKit.subscriptionPeriodUnit === 'month' ? `${storeKit.displayPrice}/month` : storeKit.displayPrice;
    }
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

  async function restorePurchases() {
    setLoading('restore');
    setMessage('');
    try {
      const nextUser = await restoreApplePurchases();
      if (nextUser) onUserUpdated?.(nextUser);
      setMessage(nextUser ? `Restored ${planLabel(nextUser.plan)}.` : 'No Apple subscriptions to restore.');
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
                      void (useAppleCheckout
                        ? requestAppleCheckout(plan.id as 'self_guided' | 'plus')
                        : requestWebCheckout(plan.id as 'self_guided' | 'plus'))
                    }
                  >
                    {loading === plan.id ? 'Loading…' : useAppleCheckout ? 'Subscribe' : 'Choose plan'}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {useAppleCheckout ? (
        <div className="space-y-3">
          <Button variant="secondary" disabled={loading !== null} onClick={() => void restorePurchases()}>
            {loading === 'restore' ? 'Restoring…' : 'Restore purchases'}
          </Button>
          <p className="text-xs text-app-text-muted">
            Payment is charged to your Apple ID. Subscriptions renew monthly unless you cancel at least 24 hours
            before the period ends. Manage or cancel in Settings → Apple ID → Subscriptions.{' '}
            <Link className="underline" to="/privacy">
              Privacy Policy
            </Link>
            .
          </p>
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
