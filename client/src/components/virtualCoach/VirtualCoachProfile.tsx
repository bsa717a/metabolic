import { type ReactNode, useState } from 'react';
import { Cake, Check, Download, Heart, MapPin, MessageCircle, Smile } from 'lucide-react';
import type { VirtualCoach } from '../../data/virtualCoaches';
import { downloadCoachContact } from '../../utils/coachVcard';
import { formatSmsPhoneDisplay } from '../../config/sms';
import { Button } from '../ui/Button';

function TraitRow({ icon: Icon, label, value }: { icon: typeof Cake; label: string; value: string | number }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={18} className="mt-0.5 shrink-0 text-brand-green dark:text-brand-green-light" aria-hidden />
      <p className="text-sm text-app-text">
        <span className="font-semibold text-brand-navy dark:text-brand-off-white">{label}:</span> {value}
      </p>
    </div>
  );
}

/**
 * Presentational profile for a virtual coach: the full poster card plus bio,
 * traits, and the Download contact / Text actions. Pages inject a context-
 * specific `primaryAction` (e.g. "Make my coach" or left empty for the section).
 */
export function VirtualCoachProfile({
  coach,
  selected,
  primaryAction,
  layout = 'split',
  showTextAction = true
}: {
  coach: VirtualCoach;
  selected: boolean;
  primaryAction?: ReactNode;
  /** `poster` shows only the coach card graphic with actions underneath. */
  layout?: 'split' | 'poster';
  showTextAction?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  async function downloadContact() {
    setDownloading(true);
    setError('');
    try {
      await downloadCoachContact(coach);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to download contact');
    } finally {
      setDownloading(false);
    }
  }

  const smsHref = `sms:${coach.phone}?body=${encodeURIComponent(`Hi ${coach.name}!`)}`;

  const actionButtons = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {primaryAction}
      <Button variant="secondary" onClick={downloadContact} disabled={downloading}>
        <span className="inline-flex items-center gap-2">
          <Download size={16} aria-hidden /> {downloading ? 'Preparing…' : 'Download contact'}
        </span>
      </Button>
      {showTextAction ? (
        <a
          href={smsHref}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-app-surface px-4 py-2 text-sm font-semibold text-app-text ring-1 ring-inset ring-app-border transition hover:bg-app-muted"
        >
          <MessageCircle size={16} aria-hidden /> Text {coach.name}
        </a>
      ) : null}
    </div>
  );

  if (layout === 'poster') {
    return (
      <div className="mx-auto max-w-md space-y-5">
        <div
          className="overflow-hidden rounded-2xl border-2 bg-app-surface shadow-sm"
          style={{ borderColor: coach.accent }}
        >
          <img src={coach.image} alt={`${coach.name} — ${coach.role}`} className="block w-full" />
        </div>

        {actionButtons}

        {showTextAction ? (
          <p className="text-center text-xs text-app-text-muted">
            All virtual coaches text from {formatSmsPhoneDisplay(coach.phone)}. Save the contact so their replies show up
            under their name. Message and data rates may apply.
          </p>
        ) : null}
        {error && <p className="text-center text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div
        className="overflow-hidden rounded-2xl border-2 bg-app-surface shadow-sm"
        style={{ borderColor: coach.accent }}
      >
        <img src={coach.image} alt={`${coach.name} — ${coach.role}`} className="block w-full" />
      </div>

      <div className="rounded-2xl border border-app-border bg-app-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold text-brand-navy dark:text-brand-off-white">{coach.name}</h2>
          {selected && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-green px-2.5 py-1 text-xs font-semibold text-brand-navy">
              <Check size={12} aria-hidden /> Your coach
            </span>
          )}
        </div>
        <p className="mt-1 text-sm font-medium uppercase tracking-wide text-app-text-muted">{coach.role}</p>
        <p className="mt-4 text-base italic text-app-text">{coach.tagline}</p>
        <p className="mt-3 text-sm leading-relaxed text-app-text">{coach.bio}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <TraitRow icon={Cake} label="Age" value={coach.age} />
          <TraitRow icon={MapPin} label="From" value={coach.location} />
          <TraitRow icon={Heart} label="Likes" value={coach.likes} />
          <TraitRow icon={Smile} label="Vibe" value={coach.vibe} />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {actionButtons}
        </div>

        {showTextAction ? (
          <p className="mt-3 text-xs text-app-text-muted">
            All virtual coaches text from {formatSmsPhoneDisplay(coach.phone)}. Save the contact so their replies show up
            under their name. Message and data rates may apply.
          </p>
        ) : null}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
