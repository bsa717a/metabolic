import type { ReactNode } from 'react';
import { useEntitlements } from '../../context/EntitlementsContext';
import { getRequiredPlan, type FeatureKey } from '../../utils/entitlements';
import { UpgradePrompt } from './UpgradePrompt';

type FeatureGateProps = {
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
};

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { user, canAccess } = useEntitlements();

  if (canAccess(feature)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <UpgradePrompt
      feature={feature}
      currentPlan={user?.plan ?? 'starter'}
      requiredPlan={getRequiredPlan(feature)}
    />
  );
}
