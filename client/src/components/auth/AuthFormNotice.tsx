import type { ReactNode } from 'react';

export function AuthFormNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="rounded-2xl border border-brand-green/30 bg-brand-green/10 p-4 text-sm"
      role="alert"
      aria-live="polite"
    >
      <p className="font-medium text-brand-navy dark:text-brand-off-white">{title}</p>
      <p className="mt-1 text-app-text-muted">{children}</p>
    </div>
  );
}
