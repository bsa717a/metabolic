import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { PUBLIC_PLANS } from '../../data/plans';

export function PlanComparisonSection({
  showActions = false,
  authenticated = false
}: {
  showActions?: boolean;
  authenticated?: boolean;
}) {
  return (
    <>
      <div className="mb-10 text-center">
        <h2 className="text-3xl font-bold text-brand-navy dark:text-brand-off-white sm:text-4xl">
          Simple plans for real progress
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-app-text-muted">
          Start free, grow with Self-Guided Metabolic, or go deeper with Plus. Coach-led programs are arranged
          directly with participating coaches.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {PUBLIC_PLANS.map((plan) => (
          <article
            key={plan.id}
            className={`relative flex flex-col rounded-2xl border bg-app-surface p-6 shadow-sm ${
              plan.recommended ? 'border-brand-green ring-2 ring-brand-green/30' : 'border-app-border'
            }`}
          >
            {plan.recommended ? (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-green px-3 py-1 text-xs font-semibold text-white">
                Recommended
              </span>
            ) : null}
            <h3 className="text-xl font-bold text-brand-navy dark:text-brand-off-white">{plan.name}</h3>
            <p className="mt-1 text-3xl font-bold text-brand-green">{plan.price}</p>
            <p className="mt-2 text-sm text-app-text-muted">{plan.description}</p>
            <ul className="mt-6 flex-1 space-y-3">
              {plan.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2 text-sm text-app-text">
                  <Check className="mt-0.5 shrink-0 text-brand-green" size={16} aria-hidden />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            {showActions ? (
              <div className="mt-6">
                {authenticated ? (
                  <Link to="/upgrade">
                    <Button className="w-full" variant={plan.recommended ? 'primary' : 'secondary'}>
                      {plan.id === 'starter' ? 'Current or downgrade' : 'Upgrade'}
                    </Button>
                  </Link>
                ) : (
                  <Link to="/login">
                    <Button className="w-full" variant={plan.recommended ? 'primary' : 'secondary'}>
                      Get started
                    </Button>
                  </Link>
                )}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}
