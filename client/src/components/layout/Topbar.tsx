import { clsx } from 'clsx';
import { Apple, ChevronDown, Dumbbell, Gauge, LayoutDashboard, LineChart, LogOut, Moon, Settings, Sparkles, Sun, Target, TrendingUp, UserRound, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../../services/auth';
import type { AppUser } from '../../types';
import { useTheme } from '../../theme/ThemeContext';
import { BrandLogo } from '../brand/BrandLogo';
import { EditAccountDetailsDrawer } from '../user/EditAccountDetailsDrawer';
import { TopbarGamification } from './TopbarGamification';
import { ColorThemePicker } from './ColorThemePicker';
import { ThemeToggle } from './ThemeToggle';
import { isAdminRole, isCoachRole } from '../../utils/roles';

const MOBILE_NAV_LINKS = [
  ['/', 'Home', Gauge],
  ['/nutrition', 'Nutrition', Apple],
  ['/program', 'Metabolic Blueprint', Target],
  ['/exercise', 'Exercise', Dumbbell],
  ['/progress', 'Progress', LineChart],
  ['/level-up', 'Level Up', TrendingUp],
  ['/virtual-coach', 'Virtual Coach', Sparkles],
] as const;

function getInitials(user: Pick<AppUser, 'firstName' | 'lastName'>) {
  const first = user.firstName?.trim()?.[0] ?? '';
  const last = user.lastName?.trim()?.[0] ?? '';
  const initials = `${first}${last}`.toUpperCase();
  return initials || 'U';
}

function ProfileMenuItem({
  label,
  onClick,
  icon: Icon,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  icon: typeof UserRound;
  danger?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition ${
          danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30' : 'text-app-text hover:bg-app-muted'
        }`}
        onClick={onClick}
      >
        <Icon size={16} aria-hidden />
        {label}
      </button>
    </li>
  );
}

export function Topbar({ user }: { user?: AppUser | null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const isDashboard = location.pathname === '/';
  const [accountDetailsOpen, setAccountDetailsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const syncTopbarHeight = () => {
      document.documentElement.style.setProperty('--app-topbar-height', `${header.offsetHeight}px`);
    };

    syncTopbarHeight();
    const observer = new ResizeObserver(syncTopbarHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // Close mobile menu and profile dropdown on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  // Close mobile menu on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    }
    if (mobileMenuOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [mobileMenuOpen]);

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [profileOpen]);

  function closeProfileMenu() {
    setProfileOpen(false);
  }

  const mobileNavLinks = [
    ...MOBILE_NAV_LINKS,
    ...(isCoachRole(user?.role) ? [['/coach', 'Coach', Users] as const] : []),
  ];

  return (
    <>
      {/* Backdrop for mobile menu */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[19] sm:hidden"
          aria-hidden
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <header
        ref={headerRef}
        className={clsx(
          'sticky top-0 z-20 border-b py-2 backdrop-blur transition-colors duration-200 sm:py-3',
          isDashboard
            ? 'border-app-border bg-app-surface/90'
            : 'cursor-pointer border-brand-green/25 bg-app-muted/95 hover:bg-brand-green/10 dark:hover:bg-brand-green/15'
        )}
        onClick={isDashboard ? undefined : () => navigate('/')}
        aria-label={isDashboard ? undefined : 'Return to dashboard'}
      >
        <div className="mx-auto grid w-full max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-5 sm:gap-9 justify-self-start">
          {/* Mobile: M logo as nav trigger */}
          <button
            type="button"
            aria-label="Open navigation menu"
            aria-haspopup="menu"
            aria-expanded={mobileMenuOpen}
            className="flex shrink-0 items-center gap-1 rounded-lg transition-opacity hover:opacity-80 sm:hidden"
            onClick={(e) => {
              e.stopPropagation();
              setMobileMenuOpen((v) => !v);
            }}
          >
            <img
              src="/logo.png"
              alt=""
              aria-hidden
              width={28}
              height={28}
              className="shrink-0 object-contain [image-rendering:pixelated]"
            />
            <ChevronDown
              size={16}
              aria-hidden
              className={clsx(
                'shrink-0 text-app-text-muted transition-transform',
                mobileMenuOpen && 'rotate-180'
              )}
            />
          </button>

          {/* Desktop: existing BrandLogo */}
          <div className="hidden sm:block">
            <BrandLogo showTagline={isDashboard} markSize={36} to={isDashboard ? '/' : undefined} />
          </div>

          {!isDashboard && (
            <div className="min-w-0 pointer-events-none hidden sm:block">
              <p className="flex items-center gap-1.5 text-xs font-medium text-brand-green dark:text-brand-green-light">
                <LayoutDashboard size={14} className="shrink-0" aria-hidden />
                <span className="hidden sm:inline">Back to dashboard</span>
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
          {user ? (
            <div ref={profileRef} className="relative">
              <button
                type="button"
                aria-label="Profile menu"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-full text-sm font-medium text-app-text transition sm:rounded-xl sm:bg-app-muted sm:px-3 sm:py-2 sm:hover:bg-app-border/60"
                onClick={() => setProfileOpen((open) => !open)}
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-brand-green text-xs font-bold text-white transition hover:opacity-90 sm:hidden">
                  {getInitials(user)}
                </span>
                <UserRound size={16} aria-hidden className="hidden sm:block" />
                <span className="hidden md:inline">Hi, {user.firstName}</span>
                <span className="hidden sm:inline md:hidden">{user.firstName}</span>
              </button>
              {profileOpen && (
                <ul
                  className="absolute right-0 z-50 mt-1 min-w-[260px] rounded-xl border border-app-border bg-app-surface py-1 shadow-lg"
                  role="menu"
                >
                  <li className="border-b border-app-border px-4 py-2">
                    <p className="text-sm font-semibold text-app-text">
                      {user.firstName} {user.lastName}
                    </p>
                    {user.email ? (
                      <p className="mt-0.5 truncate text-xs text-app-text-muted">{user.email}</p>
                    ) : null}
                  </li>
                  <ProfileMenuItem
                    label="Account details"
                    icon={UserRound}
                    onClick={() => {
                      closeProfileMenu();
                      setAccountDetailsOpen(true);
                    }}
                  />
                  <ProfileMenuItem
                    label="Virtual Coaches"
                    icon={Sparkles}
                    onClick={() => {
                      closeProfileMenu();
                      navigate('/virtual-coach/choose');
                    }}
                  />
                  {isAdminRole(user.role) ? (
                    <ProfileMenuItem
                      label="Admin"
                      icon={Settings}
                      onClick={() => {
                        closeProfileMenu();
                        navigate('/admin');
                      }}
                    />
                  ) : null}
                  <li className="border-t border-app-border px-4 py-3">
                    <ColorThemePicker />
                  </li>
                  <ProfileMenuItem
                    label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                    icon={theme === 'dark' ? Sun : Moon}
                    onClick={() => {
                      toggleTheme();
                      closeProfileMenu();
                    }}
                  />
                  <ProfileMenuItem
                    label="Logout"
                    icon={LogOut}
                    danger
                    onClick={() => {
                      closeProfileMenu();
                      void logout();
                    }}
                  />
                </ul>
              )}
            </div>
          ) : (
            <>
              <ThemeToggle />
              <button
                type="button"
                className="flex items-center gap-2 rounded-xl bg-app-muted px-3 py-2 text-sm font-medium text-app-text transition hover:bg-app-border/60"
                onClick={() => void logout()}
              >
                <LogOut size={16} aria-hidden />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </>
          )}
        </div>
        </div>

        {/* Mobile nav dropdown */}
        {mobileMenuOpen && (
          <nav
            className="absolute inset-x-0 top-full z-50 border-b border-app-border bg-app-surface shadow-lg sm:hidden"
            role="menu"
            aria-label="Navigation menu"
            onClick={(event) => event.stopPropagation()}
          >
            <ul className="py-2">
              {mobileNavLinks.map(([to, label, Icon]) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    role="menuitem"
                    className={({ isActive }) =>
                      clsx(
                        'flex items-center gap-3 px-5 py-3 text-sm font-medium transition',
                        isActive
                          ? 'bg-brand/10 text-brand-green dark:text-brand-green-light'
                          : 'text-app-text hover:bg-app-muted'
                      )
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      setMobileMenuOpen(false);
                    }}
                  >
                    <Icon size={18} aria-hidden />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      {user ? (
        <EditAccountDetailsDrawer
          open={accountDetailsOpen}
          userId={user.id}
          title="Account details"
          mode="self"
          onClose={() => setAccountDetailsOpen(false)}
        />
      ) : null}
    </>
  );
}
