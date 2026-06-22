import { useState } from 'react';
import { pickDashboardCopy } from '../../utils/dashboardCopy';

export function DashboardWelcome({ firstName }: { firstName?: string }) {
  const [copy] = useState(() => pickDashboardCopy(firstName));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-navy dark:text-brand-off-white sm:text-3xl">{copy.title}</h1>
      <p className="mt-1 text-[0.8rem] text-app-text-muted sm:text-base">{copy.subtitle}</p>
    </div>
  );
}
