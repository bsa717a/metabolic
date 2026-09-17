import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import type { PlanSlug } from '../../types';
import { getRequiredPlan, getUpgradePlan, planLabel, planPriceLabel, type FeatureKey } from '../../utils/entitlements';
import { hidesDigitalPlanPurchase, IOS_PLAN_MANAGE_COPY } from '../../utils/nativePlatform';

type UpgradePromptProps = {
  feature?: FeatureKey;
  requiredPlan?: PlanSlug;
  currentPlan?: PlanSlug;
  className?: string;
};

export function UpgradePrompt({ feature, requiredPlan, currentPlan = 'starter', className }: UpgradePromptProps) {
  const required = requiredPlan ?? (feature ? getRequiredPlan(feature) : 'self_guided');
  const upgrade = getUpgradePlan(currentPlan, required);
  const hidePlanPurchase = hidesDigitalPlanPurchase();

  if (required === 'coach_led') {
    return (
      <Card className={className ?? 'border-brand-gold/30 bg-brand-gold/5 p-6 text-center'}>
        <Sparkles className="mx-auto mb-3 text-brand-gold" size={28} aria-hidden />
        <h3 className="text-lg font-bold text-brand-navy dark:text-brand-off-white">Coach-led access</h3>
        <p className="mt-2 text-sm text-app-text-muted">
          Coach-led programs are available through participating coaches — not as a public subscription. Ask your
          coach about joining their program.
        </p>
      </Card>
    );
  }

  if (hidePlanPurchase) {
    return (
      <Card className={className ?? 'border-brand-green/30 bg-brand-green/5 p-6 text-center'}>
        <Sparkles className="mx-auto mb-3 text-brand-green" size={28} aria-hidden />
        <h3 className="text-lg font-bold text-brand-navy dark:text-brand-off-white">Higher plan needed</h3>
        <p className="mt-2 text-sm text-app-text-muted">{IOS_PLAN_MANAGE_COPY}</p>
      </Card>
    );
  }

  return (
    <Card className={className ?? 'border-brand-green/30 bg-brand-green/5 p-6 text-center'}>
      <Sparkles className="mx-auto mb-3 text-brand-green" size={28} aria-hidden />
      <h3 className="text-lg font-bold text-brand-navy dark:text-brand-off-white">
        Upgrade to {planLabel(upgrade)}
      </h3>
      <p className="mt-2 text-sm text-app-text-muted">
        {planPriceLabel(upgrade) ? `${planLabel(upgrade)} is ${planPriceLabel(upgrade)}.` : ''} Unlock this feature
        and more with a higher plan.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link to="/upgrade">
          <Button>View plans</Button>
        </Link>
        <Link to="/pricing">
          <Button variant="secondary">Compare plans</Button>
        </Link>
      </div>
    </Card>
  );
}
