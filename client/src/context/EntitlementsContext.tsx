import { createContext, useContext } from 'react';
import type { AppUser } from '../types';
import { hasFeature, type FeatureKey } from '../utils/entitlements';

type EntitlementsContextValue = {
  user: AppUser | null;
  canAccess: (feature: FeatureKey) => boolean;
};

const EntitlementsContext = createContext<EntitlementsContextValue>({
  user: null,
  canAccess: () => false
});

export function EntitlementsProvider({
  user,
  children
}: {
  user: AppUser | null;
  children: React.ReactNode;
}) {
  const canAccess = (feature: FeatureKey) => (user ? hasFeature(user, feature) : false);
  return (
    <EntitlementsContext.Provider value={{ user, canAccess }}>{children}</EntitlementsContext.Provider>
  );
}

export function useEntitlements() {
  return useContext(EntitlementsContext);
}
