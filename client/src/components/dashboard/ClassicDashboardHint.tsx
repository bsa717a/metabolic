import { useState } from 'react';
import { X } from 'lucide-react';
import { dismissClassicDashboardHint, shouldShowClassicDashboardHint } from '../../utils/signupDashboardExperience';

export function ClassicDashboardHint() {
  const [visible, setVisible] = useState(shouldShowClassicDashboardHint);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-2xl border border-brand-green/30 bg-brand-green/10 px-4 py-3 text-sm text-brand-navy dark:text-brand-off-white"
    >
      <p>
        This is the working dashboard. If you&apos;d rather see Coach Home, click your name and select{' '}
        <span className="font-semibold">Dashboard: Coach Home</span>.
      </p>
      <button
        type="button"
        className="shrink-0 rounded-lg p-1 text-app-text-muted transition hover:bg-brand-green/20 hover:text-app-text"
        aria-label="Dismiss"
        onClick={() => {
          dismissClassicDashboardHint();
          setVisible(false);
        }}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
