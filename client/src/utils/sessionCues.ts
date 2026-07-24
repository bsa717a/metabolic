/**
 * Audio + haptic cues for the workout session. Browsers (especially iOS/Safari)
 * keep AudioContext suspended until a user gesture unlocks it — call
 * {@link primeAudio} from Start / Complete-set taps before any timer cue.
 */

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

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

/** Tiny silent WAV so HTMLAudio can be unlocked during a user gesture. */
function silentWavDataUri(): string {
  // 1-sample silent 8-bit mono WAV @ 8kHz
  return 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
}

/** Build a louder triple-beep WAV (no Web Audio dependency). */
function alarmWavDataUri(): string {
  const sampleRate = 22050;
  const tones = [
    { freq: 880, start: 0, dur: 0.22 },
    { freq: 880, start: 0.28, dur: 0.22 },
    { freq: 1175, start: 0.56, dur: 0.5 }
  ];
  const totalSec = 1.1;
  const numSamples = Math.floor(sampleRate * totalSec);
  const samples = new Int16Array(numSamples);

  for (const tone of tones) {
    const start = Math.floor(tone.start * sampleRate);
    const end = Math.min(numSamples, Math.floor((tone.start + tone.dur) * sampleRate));
    for (let i = start; i < end; i++) {
      const t = (i - start) / sampleRate;
      const env = Math.min(1, t * 40) * Math.min(1, (tone.dur - t) * 20);
      // Square-ish wave for a piercing gym-timer sound
      const wave = Math.sin(2 * Math.PI * tone.freq * t) >= 0 ? 1 : -1;
      samples[i] = Math.max(-32767, Math.min(32767, Math.round(wave * env * 28000)));
    }
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
    htmlAudio = new Audio(alarmWavDataUri());
    htmlAudio.preload = 'auto';
  }
  return htmlAudio;
}

async function unlockAudio(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // ignore
    }
  }
  if (ctx?.state === 'running') {
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

  // Also unlock HTMLAudio — more reliable on iOS when Web Audio stays suspended.
  try {
    const unlockEl = new Audio(silentWavDataUri());
    unlockEl.volume = 0.01;
    await unlockEl.play();
    unlockEl.pause();
  } catch {
    // ignore — may still work later after another gesture
  }

  try {
    const alarm = getHtmlAudio();
    alarm.volume = 0.01;
    await alarm.play();
    alarm.pause();
    alarm.currentTime = 0;
    alarm.volume = 1;
  } catch {
    // ignore
  }
}

/** Call from a user gesture (Start workout / Complete set / Skip rest). */
export function primeAudio(): void {
  // Kick HTMLAudio.play() in this synchronous turn so iOS treats it as a gesture.
  try {
    const alarm = getHtmlAudio();
    alarm.muted = true;
    void alarm
      .play()
      .then(() => {
        alarm.pause();
        alarm.currentTime = 0;
        alarm.muted = false;
        alarm.volume = 1;
      })
      .catch(() => {
        alarm.muted = false;
      });
  } catch {
    // ignore
  }

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

async function beepViaWebAudio(): Promise<boolean> {
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

  const t0 = ctx.currentTime;
  const pattern = [
    { at: 0, freq: 880, dur: 0.22 },
    { at: 0.28, freq: 880, dur: 0.22 },
    { at: 0.56, freq: 1175, dur: 0.5 }
  ];
  for (const tone of pattern) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = tone.freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const start = t0 + tone.at;
    const end = start + tone.dur;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.7, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.start(start);
    osc.stop(end + 0.02);
  }
  return true;
}

async function beepViaHtmlAudio(): Promise<boolean> {
  try {
    const el = getHtmlAudio();
    el.currentTime = 0;
    el.volume = 1;
    await el.play();
    return true;
  } catch {
    return false;
  }
}

async function beep(): Promise<void> {
  const webOk = await beepViaWebAudio();
  if (webOk) return;
  await beepViaHtmlAudio();
}

/** Fire when a rest (or duration) timer elapses. */
export function restEndCue(sound: boolean): void {
  if (sound) void beep();
  try {
    navigator.vibrate?.([300, 120, 300, 120, 500]);
  } catch {
    // vibration unsupported — ignore
  }
}
