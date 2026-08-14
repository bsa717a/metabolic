import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play } from 'lucide-react';
import { Card } from '../ui/Card';
import { setTransientAudioSession } from '../../utils/sessionCues';

export function ExerciseHowToVideoButton({
  name,
  videoUrl,
  variant = 'default'
}: {
  name: string;
  videoUrl?: string | null;
  variant?: 'default' | 'primary' | 'muted';
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    setTransientAudioSession();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!videoUrl) return null;

  const styles = {
    default: 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
    primary: 'text-blue-700 hover:bg-blue-50',
    muted: 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
  };

  return (
    <>
      <button
        type="button"
        aria-label={`Watch how to do ${name}`}
        title="Watch how-to video"
        className={`grid h-9 w-9 place-items-center rounded-xl transition ${styles[variant]}`}
        onClick={() => setOpen(true)}
      >
        <Play size={18} />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/40 p-4">
            <Card className="w-full max-w-3xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">How to: {name}</h2>
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
              <video
                controls
                playsInline
                autoPlay
                muted
                className="w-full rounded-xl bg-black"
                src={videoUrl}
              >
                Your browser does not support video playback.
              </video>
            </Card>
          </div>,
          document.body
        )}
    </>
  );
}
