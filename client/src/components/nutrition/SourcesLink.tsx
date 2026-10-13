import { Link } from 'react-router-dom';
import { NOT_MEDICAL_ADVICE, SOURCES_PATH } from '../../content/nutritionSources';

export function SourcesLink({ className = '' }: { className?: string }) {
  return (
    <Link
      to={SOURCES_PATH}
      className={`shrink-0 text-sm font-semibold text-brand-green underline underline-offset-2 hover:opacity-80 ${className}`}
    >
      Sources
    </Link>
  );
}

/** Sources link plus the not-medical-advice line, for placement next to targets. */
export function SourcesBesideTargets({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${className}`}>
      <SourcesLink />
      <p className="text-xs text-app-text-muted">{NOT_MEDICAL_ADVICE}</p>
    </div>
  );
}
