import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hapticImpact = vi.fn();
let native = false;

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native
  }
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: (...args: unknown[]) => hapticImpact(...args)
  },
  ImpactStyle: {
    Light: 'LIGHT',
    Medium: 'MEDIUM',
    Heavy: 'HEAVY'
  }
}));

type Listener = (event?: Event) => void;

function makeOscillator() {
  return {
    type: 'sine',
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  };
}

function makeGain() {
  return {
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn()
    }
  };
}

class FakeAudioContext {
  state = 'suspended';
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  createOscillator = vi.fn(() => makeOscillator());
  createGain = vi.fn(() => makeGain());
  createBuffer = vi.fn(() => ({}));
  createBufferSource = vi.fn(() => ({
    buffer: null,
    connect: vi.fn(),
    start: vi.fn()
  }));
}

describe('sessionCues', () => {
  const windowListeners: Record<string, Listener[]> = {};
  const documentListeners: Record<string, Listener[]> = {};
  let ctx: FakeAudioContext;
  let warn: ReturnType<typeof vi.spyOn>;
  const vibrate = vi.fn();
  const play = vi.fn().mockResolvedValue(undefined);
  const speechSpeak = vi.fn();
  const speechCancel = vi.fn();
  const speechResume = vi.fn();
  const speechGetVoices = vi.fn(() => [] as SpeechSynthesisVoice[]);
  const speechState = { paused: false, speaking: false };

  function fireDocument(type: string) {
    for (const listener of documentListeners[type] ?? []) listener();
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    native = false;
    ctx = new FakeAudioContext();
    for (const key of Object.keys(windowListeners)) delete windowListeners[key];
    for (const key of Object.keys(documentListeners)) delete documentListeners[key];

    speechState.paused = false;
    speechState.speaking = false;
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text = '';
        volume = 1;
        rate = 1;
        pitch = 1;
        lang = '';
        voice: SpeechSynthesisVoice | null = null;
        onerror: ((event: { error: string }) => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      }
    );
    vi.stubGlobal(
      'window',
      {
        AudioContext: function AudioContext() {
          return ctx;
        },
        addEventListener: (type: string, listener: Listener) => {
          (windowListeners[type] ??= []).push(listener);
        },
        setTimeout: (fn: () => void, _ms?: number) => {
          fn();
          return 0;
        },
        speechSynthesis: {
          get paused() {
            return speechState.paused;
          },
          get speaking() {
            return speechState.speaking;
          },
          getVoices: speechGetVoices,
          speak: speechSpeak,
          cancel: speechCancel,
          resume: speechResume
        }
      }
    );
    vi.stubGlobal('document', {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: (type: string, listener: Listener) => {
        (documentListeners[type] ??= []).push(listener);
      }
    });
    vi.stubGlobal('navigator', { vibrate });
    vi.stubGlobal(
      'Audio',
      class {
        src = '';
        preload = '';
        volume = 1;
        currentTime = 0;
        play = play;
      }
    );
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllGlobals();
  });

  it('primes a suspended AudioContext from a user gesture', async () => {
    const { primeAudio } = await import('./sessionCues');
    primeAudio();
    await vi.waitFor(() => expect(ctx.resume).toHaveBeenCalled());
    expect(ctx.createBufferSource).toHaveBeenCalled();
  });

  it('resumes an existing AudioContext when the page becomes visible', async () => {
    const { primeAudio } = await import('./sessionCues');
    primeAudio();
    await vi.waitFor(() => expect(ctx.state).toBe('running'));
    ctx.state = 'suspended';
    ctx.resume.mockClear();

    const doc = globalThis.document as { visibilityState: DocumentVisibilityState };
    doc.visibilityState = 'hidden';
    fireDocument('visibilitychange');
    expect(ctx.resume).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    fireDocument('visibilitychange');
    await vi.waitFor(() => expect(ctx.resume).toHaveBeenCalled());
  });

  it('plays a Web Audio tick and a light native haptic', async () => {
    native = true;
    ctx.state = 'running';
    const { countdownTick } = await import('./sessionCues');
    countdownTick(true);
    await vi.waitFor(() => expect(ctx.createOscillator).toHaveBeenCalled());
    expect(hapticImpact).toHaveBeenCalledWith({ style: 'LIGHT' });
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('plays a stronger native haptic on GO, speaks Go, and skips web vibrate', async () => {
    native = true;
    ctx.state = 'running';
    const { restEndCue } = await import('./sessionCues');
    restEndCue(true);
    await vi.waitFor(() => expect(ctx.createOscillator).toHaveBeenCalled());
    expect(hapticImpact).toHaveBeenCalledWith({ style: 'HEAVY' });
    expect(vibrate).not.toHaveBeenCalled();
    expect(speechSpeak).toHaveBeenCalled();
    const uttered = speechSpeak.mock.calls[0]?.[0] as { text?: string };
    expect(uttered?.text).toBe('Go!');
  });

  it('does not speak Go when session sound is muted', async () => {
    native = true;
    ctx.state = 'running';
    const { restEndCue } = await import('./sessionCues');
    restEndCue(false);
    expect(speechSpeak).not.toHaveBeenCalled();
    expect(hapticImpact).toHaveBeenCalledWith({ style: 'HEAVY' });
  });

  it('skips the 4-count in the exported tick schedule', async () => {
    const { COUNTDOWN_TICK_MARKS_MS } = await import('./sessionCues');
    expect([...COUNTDOWN_TICK_MARKS_MS]).toEqual([5000, 3000, 2000, 1000]);
  });

  it('uses navigator.vibrate on web GO and does not call native haptics', async () => {
    native = false;
    ctx.state = 'running';
    const { restEndCue, countdownTick } = await import('./sessionCues');
    countdownTick(true);
    restEndCue(true);
    await vi.waitFor(() => expect(ctx.createOscillator).toHaveBeenCalled());
    expect(hapticImpact).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledWith([80, 40, 120]);
  });

  it('logs when both audio backends fail instead of swallowing', async () => {
    ctx.resume.mockRejectedValueOnce(new Error('blocked'));
    play.mockRejectedValueOnce(new Error('play failed'));
    const { countdownTick } = await import('./sessionCues');
    countdownTick(true);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(warn.mock.calls.some((call: unknown[]) => String(call[0]).includes('[sessionCues]'))).toBe(true);
  });
});
