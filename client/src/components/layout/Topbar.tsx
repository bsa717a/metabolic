import { clsx } from 'clsx';
import { LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../../services/auth';
import type { AppUser } from '../../types';
import { BrandLogo } from '../brand/BrandLogo';
import { EditAccountDetailsDrawer } from '../user/EditAccountDetailsDrawer';
import { ThemeToggle } from './ThemeToggle';
import { TopbarGamification } from './TopbarGamification';

export function Topbar({ user }: { user?: AppUser | null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isDashboard = location.pathname === '/';
  const [accountDetailsOpen, setAccountDetailsOpen] = useState(false);

  return (
    <header
      className={clsx(
        'sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-4 py-3 backdrop-blur transition-colors duration-200',
        isDashboard
          ? 'border-app-border bg-app-surface/90'
          : 'cursor-pointer border-brand-green/25 bg-app-muted/95 hover:bg-brand-green/10 dark:hover:bg-brand-green/15'
      )}
      onClick={isDashboard ? undefined : () => navigate('/')}
      aria-label={isDashboard ? undefined : 'Return to dashboard'}
    >
      <div className="flex min-w-0 items-center gap-5 sm:gap-9 justify-self-start">
        <BrandLogo showTagline={isDashboard} markSize={36} to={isDashboard ? '/' : undefined} />
        {!isDashboard && (
          <div className="min-w-0 pointer-events-none">
            <p className="flex items-center gap-1.5 text-xs font-medium text-brand-green dark:text-brand-green-light">
              <LayoutDashboard size={14} className="shrink-0" aria-hidden />
              <span className="hidden sm:inline">Back to dashboard</span>
              <span className="sm:hidden">Dashboard</span>
            </p>
            <p className="mt-0.5 hidden text-[10px] text-app-text-muted md:block">
              Click anywhere on this bar
            </p>
          </div>
        )}
      </div>

      <div
        className="justify-self-center min-w-0 w-full max-w-xl md:max-w-2xl px-1 overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <TopbarGamification />
      </div>

      <div
        className="flex items-center gap-3 justify-self-end"
        onClick={(event) => event.stopPropagation()}
      >
        {user && (
          <>
            <button
              type="button"
              className="flex items-center gap-2 rounded-xl bg-app-muted px-3 py-2 text-sm font-medium text-app-text transition hover:bg-app-border/60"
              onClick={() => setAccountDetailsOpen(true)}
            >
              <UserRound size={16} aria-hidden />
              <span className="hidden md:inline">Hi, {user.firstName}</span>
              <span className="md:hidden">Account</span>
            </button>
          </>
        )}

        <ThemeToggle />

        <button
          className="flex items-center gap-2 rounded-xl bg-app-muted hover:bg-app-border/60 text-app-text px-3 py-2 text-sm font-medium transition-colors"
          onClick={() => logout()}
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>

      {user ? (
        <EditAccountDetailsDrawer
          open={accountDetailsOpen}
          userId={user.id}
          title="Account details"
          mode="self"
          onClose={() => setAccountDetailsOpen(false)}
        />
      ) : null}
    </header>
  );
}
