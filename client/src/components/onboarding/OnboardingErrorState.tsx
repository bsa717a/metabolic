import { OnboardingShell } from './OnboardingShell';
import { onboardingPrimaryButtonClass } from './onboardingStyles';

export function OnboardingErrorState({
  message,
  onRetry
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <OnboardingShell footer="We need your profile details to personalize your plan.">
      <div className="mt-8 space-y-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-brand-navy dark:text-brand-off-white">
          Something went wrong
        </h1>
        <p className="text-sm leading-relaxed text-app-text-muted">{message}</p>
        <button type="button" className={onboardingPrimaryButtonClass} onClick={onRetry}>
          Try again
        </button>
      </div>
    </OnboardingShell>
  );
}
