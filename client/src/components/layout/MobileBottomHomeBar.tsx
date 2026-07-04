import { Gauge } from 'lucide-react';
import { Link } from 'react-router-dom';

export function MobileBottomHomeBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-app-border bg-app-surface/95 backdrop-blur sm:hidden"
      aria-label="Mobile home navigation"
    >
      <Link
        to="/"
        className="flex flex-col items-center justify-center gap-1 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-xs font-semibold text-brand-green transition hover:text-brand-deep dark:text-brand-green-light"
      >
        <Gauge size={22} aria-hidden />
        Home
      </Link>
    </nav>
  );
}
