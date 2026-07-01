import { useEffect, useRef, useState } from 'react';
import { BarChart3, Mic, MicOff, PhoneOff, Settings2, Volume2, VolumeX } from 'lucide-react';
import type { VirtualCoach } from '../../data/virtualCoaches';
import type { PlanAdvance, VirtualCoachCheckInRecap, VirtualCoachCheckInSession } from '../../types';
import { api } from '../../services/api';
import { useSpeech } from '../../hooks/useSpeech';
import { Button } from '../ui/Button';
import { CheckInRecap } from './CheckInRecap';
import { CoachWeekStatsModal } from './CoachWeekStats';

type TranscriptEntry = { role: 'coach' | 'user'; content: string };

export function CoachCheckInCall({
  coach,
  initialSession,
  onEnd
}: {
  coach: VirtualCoach;
  initialSession: VirtualCoachCheckInSession;
  onEnd: (recap: VirtualCoachCheckInRecap | null) => void;
}) {
  const [session, setSession] = useState(initialSession);
  const [chips, setChips] = useState(initialSession.chips ?? []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [endedRecap, setEndedRecap] = useState<VirtualCoachCheckInRecap | null>(null);
  const [planAdvance, setPlanAdvance] = useState<PlanAdvance | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const speakRef = useRef<(text: string) => void>(() => undefined);
  const lastSpokenRef = useRef<string | null>(null);
  const {
    speechSupported,
    listening,
    muted,
    setMuted,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    voices,
    voiceURI,
    setVoiceURI,
    naturalAvailable,
    naturalVoice,
    setNaturalVoice
  } = useSpeech(coach.id);
  speakRef.current = speak;
  const sampleLine = `Hi, it's ${coach.name}. This is how I'll sound.`;
  const [showVoicePicker, setShowVoicePicker] = useState(false);

  const transcript: TranscriptEntry[] = session.transcript.map((entry) => ({
    role: entry.role,
    content: entry.content
  }));

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: 'smooth' });
  }, [transcript.length, loading]);

  useEffect(() => {
    const lastCoach = [...session.transcript].reverse().find((entry) => entry.role === 'coach');
    if (!lastCoach || endedRecap) return;

    const speakKey = `${session.id}:${session.transcript.length}:${lastCoach.content}`;
    if (lastSpokenRef.current === speakKey) return;
    lastSpokenRef.current = speakKey;

    setSpeaking(true);
    speakRef.current(lastCoach.content);
    const timer = window.setTimeout(() => setSpeaking(false), Math.min(lastCoach.content.length * 45, 12000));
    return () => {
      window.clearTimeout(timer);
      setSpeaking(false);
    };
  }, [session.id, session.transcript.length, endedRecap]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || endedRecap) return;

    setLoading(true);
    setError(undefined);
    stopListening();

    try {
      const result = await api<VirtualCoachCheckInSession>(`/api/virtual-coach/check-in/${session.id}/message`, {
        method: 'POST',
        body: JSON.stringify({ message: trimmed })
      });
      setSession(result);
      setChips(result.chips ?? []);
      setInput('');
      if (result.done && result.status === 'COMPLETED') {
        setEndedRecap(result.recap);
        setPlanAdvance(result.planAdvance ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function endCall() {
    stopSpeaking();
    stopListening();
    setLoading(true);
    setError(undefined);
    try {
      const result = await api<VirtualCoachCheckInSession>(`/api/virtual-coach/check-in/${session.id}/complete`, {
        method: 'POST'
      });
      setEndedRecap(result.recap);
      setPlanAdvance(result.planAdvance ?? null);
      onEnd(result.recap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to end check-in');
    } finally {
      setLoading(false);
    }
  }

  if (endedRecap) {
    return (
      <div className="space-y-6">
        <CheckInRecap recap={endedRecap} coachName={coach.name} planAdvance={planAdvance} />
        <Button variant="secondary" onClick={() => onEnd(endedRecap)}>
          Back to {coach.name}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-[42rem] max-h-[85vh] flex-col overflow-hidden rounded-3xl border border-app-border bg-app-surface shadow-lg">
      <div className="border-b border-app-border bg-brand-navy px-6 py-8 text-center dark:bg-brand-navy/90">
        <div className="relative mx-auto h-32 w-32">
          {speaking && (
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-30"
              style={{ backgroundColor: coach.accent }}
              aria-hidden
            />
          )}
          <span
            className="absolute inset-1 rounded-full ring-4 ring-white/20"
            style={{ boxShadow: speaking ? `0 0 0 6px ${coach.accent}55` : undefined }}
            aria-hidden
          />
          <img
            src={coach.image}
            alt={coach.name}
            className="relative h-full w-full rounded-full object-cover"
            style={{ objectPosition: '50% 18%' }}
          />
        </div>
        <p className="mt-4 text-lg font-semibold text-brand-off-white">{coach.name}</p>
        <p className="text-sm text-brand-off-white/70">
          {speaking ? 'Speaking…' : listening ? 'Listening…' : 'Weekly check-in'}
        </p>
      </div>

      <div ref={transcriptRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
        {transcript.map((entry, index) => (
          <div
            key={`${entry.role}-${index}`}
            className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              entry.role === 'coach'
                ? 'bg-app-muted text-app-text'
                : 'ml-auto bg-brand-navy text-brand-off-white dark:bg-brand-green dark:text-brand-navy'
            }`}
          >
            {entry.content}
          </div>
        ))}
        {loading && <p className="text-sm text-app-text-muted">{coach.name} is thinking…</p>}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-app-border px-4 py-3">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={loading}
              className="rounded-full border border-app-border bg-app-bg px-3 py-1.5 text-sm font-medium text-app-text transition hover:border-brand-green/50 hover:bg-brand-green/10 disabled:opacity-50"
              onClick={() => sendMessage(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {error && <p className="px-4 text-sm text-red-600">{error}</p>}

      <div className="border-t border-app-border px-4 py-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage(input);
          }}
        >
          <input
            className="min-w-0 flex-1 rounded-xl border border-app-border bg-app-bg px-4 py-2.5 text-sm text-app-text"
            placeholder={speechSupported ? 'Type or tap the mic…' : 'Type your reply…'}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={loading}
          />
          {speechSupported && (
            <button
              type="button"
              className={`rounded-xl px-3 py-2 ring-1 ring-inset ring-app-border transition ${
                listening ? 'bg-brand-green text-brand-navy' : 'bg-app-surface text-app-text hover:bg-app-muted'
              }`}
              aria-label={listening ? 'Stop listening' : 'Speak reply'}
              onClick={() => {
                if (listening) {
                  stopListening();
                  return;
                }
                startListening((text) => sendMessage(text), setError);
              }}
              disabled={loading}
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
          <Button type="submit" disabled={loading || !input.trim()}>
            Send
          </Button>
        </form>

        {showVoicePicker && (naturalAvailable || voices.length > 0) && (
          <div className="mt-3 space-y-3 rounded-xl border border-app-border bg-app-bg/60 p-3">
            {naturalAvailable && (
              <label className="flex items-center justify-between gap-3 text-xs font-medium text-app-text">
                <span>
                  Natural AI voice
                  <span className="ml-1 font-normal text-app-text-muted">— lifelike, recommended</span>
                </span>
                <input
                  type="checkbox"
                  checked={naturalVoice}
                  onChange={(event) => {
                    setNaturalVoice(event.target.checked);
                    setMuted(false);
                    window.setTimeout(() => speak(sampleLine), 50);
                  }}
                  className="h-4 w-4 accent-brand-green"
                />
              </label>
            )}

            {naturalVoice && naturalAvailable ? (
              <button
                type="button"
                onClick={() => {
                  setMuted(false);
                  speak(sampleLine);
                }}
                className="text-xs font-semibold text-brand-green hover:text-brand-green-light"
              >
                Hear a sample
              </button>
            ) : (
              voices.length > 0 && (
                <label className="flex flex-col gap-1 text-xs font-medium text-app-text-muted">
                  {coach.name}&apos;s voice
                  <select
                    value={voiceURI ?? ''}
                    onChange={(event) => {
                      setVoiceURI(event.target.value);
                      setMuted(false);
                      window.setTimeout(() => speak(sampleLine), 50);
                    }}
                    className="rounded-lg border border-app-border bg-app-surface px-2 py-1.5 text-sm font-normal text-app-text outline-none focus:border-brand-green/60"
                  >
                    {voices.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name} ({voice.lang})
                      </option>
                    ))}
                  </select>
                  <span className="text-app-text-muted">Pick a voice, then hear a sample. Saved for {coach.name}.</span>
                </label>
              )
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 text-sm font-medium text-app-text-muted transition hover:text-app-text"
              onClick={() => setMuted((value) => !value)}
            >
              {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
              {muted ? 'Voice off' : 'Voice on'}
            </button>
            {(naturalAvailable || (speechSupported && voices.length > 0)) && (
              <button
                type="button"
                aria-label="Choose voice"
                className={`inline-flex items-center gap-1 text-sm font-medium transition hover:text-app-text ${
                  showVoicePicker ? 'text-app-text' : 'text-app-text-muted'
                }`}
                onClick={() => setShowVoicePicker((value) => !value)}
              >
                <Settings2 size={16} aria-hidden /> Voice
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-app-border bg-app-bg px-4 py-2 text-sm font-semibold text-app-text transition hover:bg-app-muted"
              onClick={() => setShowStats(true)}
            >
              <BarChart3 size={16} aria-hidden /> My stats
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-red-600/10 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-600/15 dark:text-red-300"
              onClick={endCall}
              disabled={loading}
            >
              <PhoneOff size={16} aria-hidden /> End check-in
            </button>
          </div>
        </div>
      </div>

      <CoachWeekStatsModal open={showStats} onClose={() => setShowStats(false)} coachName={coach.name} />
    </div>
  );
}
