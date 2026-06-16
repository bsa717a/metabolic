import { clsx } from 'clsx';
import { Link } from 'react-router-dom';

function BrandMark({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <img
      src="/logo.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={clsx('shrink-0 object-contain', className)}
    />
  );
}

export function BrandLogo({
  className,
  showTagline = false,
  markSize = 40,
  to
}: {
  className?: string;
  showTagline?: boolean;
  markSize?: number;
  /** When set, the logo navigates to this route (e.g. dashboard). */
  to?: string;
}) {
  const content = (
    <>
      <BrandMark size={markSize} />
      <div className="min-w-0">
        <p className="leading-none">
          <span className="text-lg font-semibold tracking-tight text-brand-navy dark:text-brand-off-white sm:text-xl">
            Metabolic
          </span>
          <span className="ml-1 text-lg font-medium text-brand-green dark:text-brand-green-light sm:text-xl">OS</span>
        </p>
        {showTagline && (
          <p className="mt-1 text-[11px] font-medium text-brand-green dark:text-brand-green-light sm:text-xs">
            The Master Metabolic Method
          </p>
        )}
      </div>
    </>
  );

  const rootClass = clsx('flex items-start gap-3', className);

  if (to) {
    return (
      <Link to={to} className={clsx(rootClass, 'rounded-lg transition-opacity hover:opacity-90')} aria-label="Go to dashboard">
        {content}
      </Link>
    );
  }

  return <div className={rootClass}>{content}</div>;
}

export function BrandMarkIcon({ size = 32, className }: { size?: number; className?: string }) {
  return <BrandMark size={size} className={className} />;
}
