import { OnboardingShell } from './OnboardingShell';

export function LoadingOnboardingState() {
  return (
    <OnboardingShell>
      <div className="mt-10 flex flex-col items-center gap-4 py-8 text-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-app-border border-t-brand-green"
          aria-hidden
        />
        <p className="text-sm text-app-text-muted">Checking your profile…</p>
      </div>
    </OnboardingShell>
  );
}
