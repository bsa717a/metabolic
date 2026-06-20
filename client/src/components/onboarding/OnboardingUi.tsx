import { ArrowRight } from 'lucide-react';
import { onboardingPrimaryButtonClass } from './onboardingStyles';

export function OnboardingPrimaryButton({
  children,
  disabled,
  loading,
  loadingLabel,
  type = 'button',
  onClick
}: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  type?: 'button' | 'submit';
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={onboardingPrimaryButtonClass}
    >
      {loading ? loadingLabel ?? 'Saving…' : children}
      {!loading ? <ArrowRight size={16} aria-hidden /> : null}
    </button>
  );
}

export function OnboardingChecklist({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3 text-sm text-app-text">
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-green/15 text-brand-green dark:bg-brand-green/20"
            aria-hidden
          >
            ✓
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function OnboardingStepHeader({
  headline,
  subheadline
}: {
  headline: string;
  subheadline: string;
}) {
  return (
    <div className="mt-6 mb-8">
      <h1 className="text-3xl font-bold tracking-tight text-brand-navy dark:text-brand-off-white">
        {headline}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-app-text-muted">{subheadline}</p>
    </div>
  );
}
