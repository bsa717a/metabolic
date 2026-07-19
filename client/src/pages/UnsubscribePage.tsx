import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

interface VerifiedInfo {
  email: string | null;
  phone: string | null;
  category: string | null;
  categoryLabel: string;
}

export function UnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [verified, setVerified] = useState<VerifiedInfo | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setError('Missing unsubscribe token.');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/unsubscribe?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Invalid or expired unsubscribe link.');
        setVerified(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid or expired unsubscribe link.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [token]);

  const handleConfirm = async () => {
    setConfirming(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/unsubscribe/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to confirm unsubscribe.');
      setConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm unsubscribe.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg dark:bg-slate-900">
        <h1 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">Unsubscribe</h1>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</div>
        ) : null}

        {confirmed ? (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
            You have been unsubscribed from optional communications from Metabolic.
          </div>
        ) : null}

        {!loading && !confirmed && verified ? (
          <>
            <p className="mb-3 text-slate-700 dark:text-slate-200">
              Confirm that you want to stop receiving optional communications{verified.categoryLabel ? ` for: ${verified.categoryLabel}` : ''}.
            </p>
            {verified.email ? <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">Email: {verified.email}</p> : null}
            {verified.phone ? <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Phone: {verified.phone}</p> : null}
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={confirming}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {confirming ? 'Processing…' : 'Confirm unsubscribe'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
