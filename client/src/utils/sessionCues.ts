/**
 * Audio + haptic cues for the workout session.
 *
 * Music-safe: declare a `transient` audio session (Safari 16.4+) and unlock
 * only via Web Audio. Playing an HTMLAudio alarm WAV upgrades iOS to
 * `playback` and pauses Spotify / Apple Music — do not do that on prime.
 */

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

type AudioSessionNavigator = Navigator & {
  audioSession?: { type: string };
};

type Tone = { freq: number; dur: number; gain: number };

const TICK: Tone = { freq: 740, dur: 0.09, gain: 0.22 };
const GO: Tone = { freq: 988, dur: 0.2, gain: 0.35 };

let audioCtx: AudioContext | null = null;
let htmlAudio: HTMLAudioElement | null = null;
let unlockPromise: Promise<void> | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!audioCtx && Ctx) audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Short notification session so cues duck/mix instead of pausing other audio. */
export function setTransientAudioSession(): void {
  try {
    const nav = navigator as AudioSessionNavigator;
    if (nav.audioSession) nav.audioSession.type = 'transient';
  } catch {
    // API missing or rejected — ignore
  }
}

/** Short sine ping WAV (GO motif) for the HTMLAudio fallback. */
function pingWavDataUri(tone: Tone): string {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * tone.dur);
  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 50) * Math.min(1, (tone.dur - t) * 25);
    const wave = Math.sin(2 * Math.PI * tone.freq * t);
    samples[i] = Math.max(-32767, Math.min(32767, Math.round(wave * env * 22000 * (tone.gain / 0.35))));
  }

  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i], true);

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function getHtmlAudio(): HTMLAudioElement {
  if (!htmlAudio) {
    htmlAudio = new Audio(pingWavDataUri(GO));
    htmlAudio.preload = 'auto';
    htmlAudio.volume = 0.45;
  }
  return htmlAudio;
}

async function unlockAudio(): Promise<void> {
  setTransientAudioSession();
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // ignore
    }
  }
  if (ctx?.state !== 'running') return;
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // ignore
  }
}

/** Call from a user gesture (Start workout / Complete set / Skip rest). */
export function primeAudio(): void {
  setTransientAudioSession();
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') {
    void ctx.resume();
  }
  if (!unlockPromise) {
    unlockPromise = unlockAudio().finally(() => {
      unlockPromise = null;
    });
  }
}

async function playViaWebAudio(tone: Tone): Promise<boolean> {
  setTransientAudioSession();
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }
  if (ctx.state !== 'running') return false;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = tone.freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const start = ctx.currentTime;
  const end = start + tone.dur;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(tone.gain, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.start(start);
  osc.stop(end + 0.02);
  return true;
}

async function playViaHtmlAudio(tone: Tone): Promise<boolean> {
  setTransientAudioSession();
  try {
    const el = getHtmlAudio();
    el.src = pingWavDataUri(tone);
    el.currentTime = 0;
    el.volume = 0.45;
    await el.play();
    return true;
  } catch {
    return false;
  }
}

async function playTone(tone: Tone): Promise<void> {
  const webOk = await playViaWebAudio(tone);
  if (webOk) return;
  await playViaHtmlAudio(tone);
}

/** Soft 3-2-1 tick. No haptic — save the pulse for GO. */
export function countdownTick(sound: boolean): void {
  if (sound) void playTone(TICK);
}

/** Fire when a rest (or duration) timer elapses. */
export function restEndCue(sound: boolean): void {
  if (sound) void playTone(GO);
  try {
    navigator.vibrate?.([80, 40, 120]);
  } catch {
    // vibration unsupported — ignore
  }
}
