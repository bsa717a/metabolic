import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/brand/BrandLogo';
import { PlanComparisonSection } from '../components/entitlements/PlanComparisonSection';
import { ColorThemePicker } from '../components/layout/ColorThemePicker';
import { ThemeToggle } from '../components/layout/ThemeToggle';
import { Button } from '../components/ui/Button';

export function PricingPage({ authenticated }: { authenticated: boolean }) {
  return (
    <div className="min-h-screen bg-app-bg px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <ColorThemePicker compact />
            <ThemeToggle />
            {authenticated ? (
              <Link to="/">
                <Button variant="secondary">Dashboard</Button>
              </Link>
            ) : (
              <Link to="/login">
                <Button>Sign in</Button>
              </Link>
            )}
          </div>
        </header>

        <PlanComparisonSection showActions authenticated={authenticated} />
      </div>
    </div>
  );
}
