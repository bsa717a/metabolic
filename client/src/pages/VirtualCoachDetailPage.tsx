import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Download, MessageCircle, Cake, MapPin, Heart, Smile } from 'lucide-react';
import type { AppUser } from '../types';
import { getVirtualCoach } from '../data/virtualCoaches';
import { downloadCoachContact } from '../utils/coachVcard';
import { formatSmsPhoneDisplay } from '../config/sms';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';

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

export function VirtualCoachDetailPage({
  user,
  onSelected
}: {
  user?: AppUser | null;
  onSelected?: (coachId: string) => void;
}) {
  const { coachId } = useParams<{ coachId: string }>();
  const coach = getVirtualCoach(coachId);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  // Tracks a selection made in this session so the UI updates immediately even
  // if the global appUser is momentarily null (e.g. /api/me failed at login).
  const [justSelectedId, setJustSelectedId] = useState<string | null>(null);

  if (!coach) {
    return (
      <div className="space-y-4">
        <Link to="/virtual-coach" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green">
          <ArrowLeft size={16} aria-hidden /> Back to virtual coaches
        </Link>
        <div className="rounded-2xl border border-app-border bg-app-surface p-6">
          <h1 className="text-xl font-bold text-brand-navy dark:text-brand-off-white">Coach not found</h1>
          <p className="mt-2 text-sm text-app-text-muted">That virtual coach does not exist. Choose one below.</p>
        </div>
      </div>
    );
  }

  const isSelected = justSelectedId === coach.id || user?.selectedVirtualCoachId === coach.id;

  async function selectCoach() {
    if (!coach) return;
    setSaving(true);
    setError('');
    try {
      await api('/api/me/virtual-coach', {
        method: 'PUT',
        body: JSON.stringify({ coachId: coach.id })
      });
      setJustSelectedId(coach.id);
      onSelected?.(coach.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to select coach');
    } finally {
      setSaving(false);
    }
  }

  async function downloadContact() {
    if (!coach) return;
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

  return (
    <div className="space-y-6">
      <Link to="/virtual-coach" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green">
        <ArrowLeft size={16} aria-hidden /> Back to virtual coaches
      </Link>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div
          className="overflow-hidden rounded-2xl border-2 bg-app-surface shadow-sm"
          style={{ borderColor: coach.accent }}
        >
          <img src={coach.image} alt={`${coach.name} — ${coach.role}`} className="block w-full" />
        </div>

        <div className="rounded-2xl border border-app-border bg-app-surface p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-brand-navy dark:text-brand-off-white">{coach.name}</h1>
            {isSelected && (
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
            <Button onClick={selectCoach} disabled={saving || isSelected}>
              {isSelected ? 'Selected as your coach' : saving ? 'Saving…' : `Make ${coach.name} my coach`}
            </Button>
            <Button variant="secondary" onClick={downloadContact} disabled={downloading}>
              <span className="inline-flex items-center gap-2">
                <Download size={16} aria-hidden /> {downloading ? 'Preparing…' : 'Download contact'}
              </span>
            </Button>
            <a
              href={smsHref}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-app-surface px-4 py-2 text-sm font-semibold text-app-text ring-1 ring-inset ring-app-border transition hover:bg-app-muted"
            >
              <MessageCircle size={16} aria-hidden /> Text {coach.name}
            </a>
          </div>

          <p className="mt-3 text-xs text-app-text-muted">
            All virtual coaches text from {formatSmsPhoneDisplay(coach.phone)}. Save the contact so their replies show
            up under their name. Message and data rates may apply.
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
