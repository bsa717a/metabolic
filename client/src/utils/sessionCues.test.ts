import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hapticImpact = vi.fn();
const nativePrime = vi.fn().mockResolvedValue(undefined);
const nativePlayTick = vi.fn().mockResolvedValue(undefined);
const nativePlayGo = vi.fn().mockResolvedValue(undefined);
let native = false;

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native
  },
  registerPlugin: () => ({
    prime: (...args: unknown[]) => nativePrime(...args),
    playTick: (...args: unknown[]) => nativePlayTick(...args),
    playGo: (...args: unknown[]) => nativePlayGo(...args)
  })
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
      value: 0,
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

type FakeAudio = {
  src: string;
  preload: string;
  volume: number;
  muted: boolean;
  currentTime: number;
  playsInline: boolean;
  play: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
};

describe('sessionCues', () => {
  const windowListeners: Record<string, Listener[]> = {};
  const documentListeners: Record<string, Listener[]> = {};
  let ctx: FakeAudioContext;
  let warn: ReturnType<typeof vi.spyOn>;
  const vibrate = vi.fn();
  const audioSession = { type: 'auto' };
  const audioInstances: FakeAudio[] = [];
  const playSrcs: string[] = [];
  const play = vi.fn().mockResolvedValue(undefined);

  function playedGoClip(): boolean {
    return playSrcs.some((src) => src.includes('go.wav'));
  }

  function fireDocument(type: string) {
    for (const listener of documentListeners[type] ?? []) listener();
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    native = false;
    nativePrime.mockReset().mockResolvedValue(undefined);
    nativePlayTick.mockReset().mockResolvedValue(undefined);
    nativePlayGo.mockReset().mockResolvedValue(undefined);
    ctx = new FakeAudioContext();
    audioSession.type = 'auto';
    audioInstances.length = 0;
    playSrcs.length = 0;
    play.mockResolvedValue(undefined);
    for (const key of Object.keys(windowListeners)) delete windowListeners[key];
    for (const key of Object.keys(documentListeners)) delete documentListeners[key];

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
        }
      }
    );
    vi.stubGlobal('document', {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: (type: string, listener: Listener) => {
        (documentListeners[type] ??= []).push(listener);
      }
    });
    vi.stubGlobal('navigator', { vibrate, audioSession });
    vi.stubGlobal(
      'Audio',
      class {
        src = '';
        preload = '';
        volume = 1;
        muted = false;
        currentTime = 0;
        playsInline = false;
        play = vi.fn(() => {
          playSrcs.push(this.src);
          return play();
        });
        load = vi.fn();
        pause = vi.fn();
        setAttribute = vi.fn();
        constructor(src?: string) {
          if (src) this.src = src;
          audioInstances.push(this as unknown as FakeAudio);
        }
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

  it('does not play go.wav when priming or unlocking audio', async () => {
    const { primeAudio, GO_CLIP_URL } = await import('./sessionCues');
    primeAudio();
    await vi.waitFor(() => expect(ctx.resume).toHaveBeenCalled());
    await vi.waitFor(() => expect(play).toHaveBeenCalled());
    expect(playedGoClip()).toBe(false);
    expect(playSrcs.every((src) => !src.includes(GO_CLIP_URL) && !src.includes('go.wav'))).toBe(true);
    expect(ctx.createBufferSource).toHaveBeenCalled();
    const goEl = audioInstances.find((el) => el.src.includes(GO_CLIP_URL) || el.src.includes('go.wav'));
    expect(goEl?.load).toHaveBeenCalled();
    expect(goEl?.play).not.toHaveBeenCalled();
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

  it('plays a native AVAudioPlayer tick without touching audioSession or WKWebView audio', async () => {
    native = true;
    ctx.state = 'running';
    const { countdownTick } = await import('./sessionCues');
    countdownTick(true);
    await vi.waitFor(() => expect(nativePlayTick).toHaveBeenCalled());
    expect(play).not.toHaveBeenCalled();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(audioSession.type).toBe('auto');
    expect(hapticImpact).toHaveBeenCalledWith({ style: 'LIGHT' });
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('primes native cues without creating Web Audio or HTMLAudio', async () => {
    native = true;
    const { primeAudio } = await import('./sessionCues');
    primeAudio();
    await vi.waitFor(() => expect(nativePrime).toHaveBeenCalled());
    expect(play).not.toHaveBeenCalled();
    expect(ctx.resume).not.toHaveBeenCalled();
    expect(ctx.createBufferSource).not.toHaveBeenCalled();
    expect(audioSession.type).toBe('auto');
  });

  it('falls back to Web Audio on native if the plugin and HTMLAudio cannot play the tick', async () => {
    native = true;
    ctx.state = 'running';
    nativePlayTick.mockRejectedValueOnce(new Error('plugin missing'));
    play.mockRejectedValueOnce(new Error('html blocked'));
    const { countdownTick } = await import('./sessionCues');
    countdownTick(true);
    await vi.waitFor(() => expect(ctx.createOscillator).toHaveBeenCalled());
    expect(warn.mock.calls.some((call: unknown[]) => String(call[0]).includes('native tick failed'))).toBe(true);
    expect(warn.mock.calls.some((call: unknown[]) => String(call[0]).includes('HTMLAudio play failed'))).toBe(true);
  });

  it('plays the recorded Go clip through the native plugin and a stronger haptic', async () => {
    native = true;
    ctx.state = 'running';
    const { restEndCue } = await import('./sessionCues');
    restEndCue(true);
    await vi.waitFor(() => expect(nativePlayGo).toHaveBeenCalled());
    expect(hapticImpact).toHaveBeenCalledWith({ style: 'HEAVY' });
    expect(vibrate).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    expect(playedGoClip()).toBe(false);
    expect(audioSession.type).toBe('auto');
  });

  it('plays go.wav only on the zero/start cue path, not on ticks', async () => {
    ctx.state = 'running';
    const { countdownTick, restEndCue } = await import('./sessionCues');
    countdownTick(true);
    await vi.waitFor(() => expect(ctx.createOscillator).toHaveBeenCalled());
    expect(playedGoClip()).toBe(false);

    restEndCue(true);
    await vi.waitFor(() => expect(playedGoClip()).toBe(true));
    expect(playSrcs.filter((src) => src.includes('go.wav'))).toHaveLength(1);
  });

  it('does not play Go when session sound is muted', async () => {
    native = true;
    ctx.state = 'running';
    const { restEndCue } = await import('./sessionCues');
    restEndCue(false);
    expect(play).not.toHaveBeenCalled();
    expect(nativePlayGo).not.toHaveBeenCalled();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    expect(hapticImpact).toHaveBeenCalledWith({ style: 'HEAVY' });
  });

  it('falls back to the GO sine if the native plugin and recorded clip cannot play', async () => {
    native = true;
    ctx.state = 'running';
    nativePlayGo.mockRejectedValueOnce(new Error('plugin missing'));
    play.mockRejectedValueOnce(new Error('clip blocked'));
    const { restEndCue } = await import('./sessionCues');
    restEndCue(true);
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    expect(warn.mock.calls.some((call: unknown[]) => String(call[0]).includes('native go failed'))).toBe(true);
    expect(warn.mock.calls.some((call: unknown[]) => String(call[0]).includes('Go clip play failed'))).toBe(true);
    expect(audioInstances.some((el) => el.src.startsWith('data:audio/wav'))).toBe(true);
    expect(ctx.createOscillator).not.toHaveBeenCalled();
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

  it('uses a transient web audioSession so Safari ducks instead of pausing Music', async () => {
    ctx.state = 'running';
    const { countdownTick } = await import('./sessionCues');
    countdownTick(true);
    await vi.waitFor(() => expect(ctx.createOscillator).toHaveBeenCalled());
    expect(audioSession.type).toBe('transient');
  });

  it('falls back to HTMLAudio at max volume when Web Audio is unavailable', async () => {
    ctx.resume.mockRejectedValue(new Error('blocked'));
    const { countdownTick } = await import('./sessionCues');
    countdownTick(true);
    await vi.waitFor(() => expect(play).toHaveBeenCalled());
    const beep = audioInstances.find((el) => el.src.startsWith('data:audio/wav'));
    expect(beep).toBeTruthy();
    expect(beep?.volume).toBe(1);
  });
});
