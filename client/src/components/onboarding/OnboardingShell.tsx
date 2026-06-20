import type { ReactNode } from 'react';
import { BrandLogo } from '../brand/BrandLogo';
import { ThemeToggle } from '../layout/ThemeToggle';

export function OnboardingShell({
  children,
  footer
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-app-bg px-4 py-12 text-app-text">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md rounded-3xl border border-app-border/60 bg-app-surface p-8 shadow-lg sm:p-10">
        <BrandLogo showTagline markSize={44} />
        {children}
      </div>

      {footer ? (
        <p className="mt-8 max-w-md text-center text-sm text-app-text-muted">{footer}</p>
      ) : null}
    </main>
  );
}
