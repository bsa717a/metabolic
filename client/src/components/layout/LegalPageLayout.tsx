import { Link } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

export function LegalPageLayout({
  title,
  lastUpdated,
  children
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-app-bg text-app-text">
      <header className="border-b border-app-border bg-app-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/login" className="flex items-center gap-3">
            <img src="/logo.png" alt="Master Metabolic" className="h-9 w-auto object-contain [image-rendering:pixelated]" />
            <span className="text-sm font-semibold">Master Metabolic</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-app-text-muted">Last updated: {lastUpdated}</p>
        <div className="prose-legal mt-8 space-y-6 text-sm leading-7 text-app-text">{children}</div>
        <footer className="mt-12 border-t border-app-border pt-6 text-sm text-app-text-muted">
          <p>
            <Link to="/sms-opt-in" className="font-medium text-app-text underline-offset-2 hover:underline">
              SMS Opt-In
            </Link>
            {' · '}
            <Link to="/campaign-policy" className="font-medium text-app-text underline-offset-2 hover:underline">
              SMS Campaign Policy
            </Link>
            {' · '}
            <Link to="/campaign-terms" className="font-medium text-app-text underline-offset-2 hover:underline">
              SMS Terms and Conditions
            </Link>
          </p>
        </footer>
      </article>
    </main>
  );
}
