import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { AppUser } from '../types';
import { getVirtualCoach } from '../data/virtualCoaches';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { VirtualCoachProfile } from '../components/virtualCoach/VirtualCoachProfile';

export function VirtualCoachDetailPage({
  user,
  onSelected
}: {
  user?: AppUser | null;
  onSelected?: (coachId: string) => void;
}) {
  const { coachId } = useParams<{ coachId: string }>();
  const navigate = useNavigate();
  const coach = getVirtualCoach(coachId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Tracks a selection made in this session so the UI updates immediately even
  // if the global appUser is momentarily null (e.g. /api/me failed at login).
  const [justSelectedId, setJustSelectedId] = useState<string | null>(null);

  if (!coach) {
    return (
      <div className="space-y-4">
        <Link to="/virtual-coach/choose" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green">
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
      navigate('/virtual-coach');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to select coach');
    } finally {
      setSaving(false);
    }
  }

  const primaryAction = (
    <Button onClick={selectCoach} disabled={saving || isSelected}>
      {isSelected ? 'Selected as your coach' : saving ? 'Saving…' : `Make ${coach.name} my coach`}
    </Button>
  );

  return (
    <div className="space-y-6">
      <Link to="/virtual-coach/choose" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green">
        <ArrowLeft size={16} aria-hidden /> Back to virtual coaches
      </Link>

      <VirtualCoachProfile coach={coach} selected={isSelected} primaryAction={primaryAction} />

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
