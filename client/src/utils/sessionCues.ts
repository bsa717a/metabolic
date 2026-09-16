/**
 * Audio + haptic cues for the workout session.
 *
 * Web/Safari: declare a `transient` audio session (Safari 16.4+) and unlock
 * only via Web Audio so cues duck/mix instead of pausing Spotify / Apple Music.
 *
 * Capacitor iOS: native AVAudioSession is `.playback` + `.mixWithOthers`
 * (SceneDelegate, copied by `native:patch`). That plays through the Silent
 * switch without interrupting other audio. On native, set
 * `navigator.audioSession` to `playback` — `transient` can leave WKWebView
 * ambient, which the Silent switch mutes.
 */

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

type AudioSessionNavigator = Navigator & {
  audioSession?: { type: string };
};

type Tone = { freq: number; dur: number; gain: number };

const TICK: Tone = { freq: 740, dur: 0.09, gain: 0.48 };
const GO: Tone = { freq: 988, dur: 0.2, gain: 0.68 };
const HTML_VOLUME = 0.85;

let audioCtx: AudioContext | null = null;
let htmlAudio: HTMLAudioElement | null = null;
let unlockPromise: Promise<void> | null = null;
let foregroundResumeInstalled = false;

function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch (error) {
    logCueFailure('Capacitor.isNativePlatform failed', error);
    return false;
  }
}

function logCueFailure(where: string, error: unknown): void {
  console.warn(`[sessionCues] ${where}`, error);
}

function getAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!audioCtx && Ctx) audioCtx = new Ctx();
    return audioCtx;
  } catch (error) {
    logCueFailure('AudioContext create failed', error);
    return null;
  }
}

/** Short notification session so how-to video / Safari cues duck instead of pausing other audio. */
export function setTransientAudioSession(): void {
  try {
    const nav = navigator as AudioSessionNavigator;
    if (nav.audioSession) nav.audioSession.type = 'transient';
  } catch (error) {
    logCueFailure('audioSession transient failed', error);
  }
}

function setCueAudioSession(): void {
  try {
    const nav = navigator as AudioSessionNavigator;
    if (!nav.audioSession) return;
    nav.audioSession.type = isNativePlatform() ? 'playback' : 'transient';
  } catch (error) {
    logCueFailure('audioSession type failed', error);
  }
}

function resumeExistingAudioContext(): void {
  if (!audioCtx) return;
  if (audioCtx.state !== 'suspended') return;
  void audioCtx.resume().catch((error) => {
    logCueFailure('AudioContext.resume failed', error);
  });
}

function installForegroundResume(): void {
  if (foregroundResumeInstalled || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  foregroundResumeInstalled = true;
  const onVisible = () => {
    if (document.visibilityState === 'visible') resumeExistingAudioContext();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', resumeExistingAudioContext);
  window.addEventListener('pageshow', resumeExistingAudioContext);
}

installForegroundResume();

/** Short sine ping WAV (GO motif) for the HTMLAudio fallback. */
function pingWavDataUri(tone: Tone): string {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * tone.dur);
  const samples = new Int16Array(numSamples);
  const peak = Math.min(1, tone.gain / GO.gain);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 50) * Math.min(1, (tone.dur - t) * 25);
    const wave = Math.sin(2 * Math.PI * tone.freq * t);
    samples[i] = Math.max(-32767, Math.min(32767, Math.round(wave * env * 26000 * peak)));
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
    htmlAudio.volume = HTML_VOLUME;
  }
  return htmlAudio;
}

async function unlockAudio(): Promise<void> {
  setCueAudioSession();
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (error) {
      logCueFailure('unlock AudioContext.resume failed', error);
    }
  }
  if (ctx?.state !== 'running') {
    logCueFailure(`unlock skipped; AudioContext state=${ctx?.state ?? 'missing'}`, null);
    return;
  }
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch (error) {
    logCueFailure('unlock silent buffer failed', error);
  }
}

/** Call from a user gesture (Start workout / Complete set / Skip rest). */
export function primeAudio(): void {
  installForegroundResume();
  setCueAudioSession();
  const ctx = getAudioContext();
  if (ctx?.state === 'suspended') {
    void ctx.resume().catch((error) => {
      logCueFailure('prime AudioContext.resume failed', error);
    });
  }
  if (!unlockPromise) {
    unlockPromise = unlockAudio().finally(() => {
      unlockPromise = null;
    });
  }
}

async function playViaWebAudio(tone: Tone): Promise<boolean> {
  setCueAudioSession();
  const ctx = getAudioContext();
  if (!ctx) {
    logCueFailure('Web Audio unavailable', null);
    return false;
  }
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch (error) {
      logCueFailure('Web Audio resume failed', error);
      return false;
    }
  }
  if (ctx.state !== 'running') {
    logCueFailure(`Web Audio not running (state=${ctx.state})`, null);
    return false;
  }

  try {
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
  } catch (error) {
    logCueFailure('Web Audio play failed', error);
    return false;
  }
}

async function playViaHtmlAudio(tone: Tone): Promise<boolean> {
  setCueAudioSession();
  try {
    const el = getHtmlAudio();
    el.src = pingWavDataUri(tone);
    el.currentTime = 0;
    el.volume = HTML_VOLUME;
    await el.play();
    return true;
  } catch (error) {
    logCueFailure('HTMLAudio play failed', error);
    return false;
  }
}

async function playTone(tone: Tone): Promise<void> {
  const webOk = await playViaWebAudio(tone);
  if (webOk) return;
  const htmlOk = await playViaHtmlAudio(tone);
  if (!htmlOk) logCueFailure('all audio backends failed', tone);
}

async function playNativeHaptic(style: ImpactStyle): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await Haptics.impact({ style });
  } catch (error) {
    logCueFailure(`Haptics.impact(${style}) failed`, error);
  }
}

/** Soft 3-2-1 tick. Light haptic on native; web has no tick vibrate. */
export function countdownTick(sound: boolean): void {
  if (sound) void playTone(TICK);
  void playNativeHaptic(ImpactStyle.Light);
}

/** Fire when a rest (or duration) timer elapses. */
export function restEndCue(sound: boolean): void {
  if (sound) void playTone(GO);
  void playNativeHaptic(ImpactStyle.Heavy);
  if (isNativePlatform()) return;
  try {
    navigator.vibrate?.([80, 40, 120]);
  } catch (error) {
    logCueFailure('navigator.vibrate failed', error);
  }
}
