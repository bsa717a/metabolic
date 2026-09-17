/**
 * Audio + haptic cues for the workout session.
 *
 * Web/Safari: declare a `transient` audio session (Safari 16.4+) and unlock
 * only via Web Audio so cues duck/mix instead of pausing Spotify / Apple Music.
 *
 * Capacitor iOS: native AVAudioSession is `.playback` + `.mixWithOthers`
 * (SceneDelegate, copied by `native:patch`). That plays through the Silent
 * switch without interrupting other audio — including the recorded "Go!" clip.
 * On native, set `navigator.audioSession` to `playback` — `transient` can
 * leave WKWebView ambient, which the Silent switch mutes.
 */

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

type AudioSessionNavigator = Navigator & {
  audioSession?: { type: string };
};

type Tone = { freq: number; dur: number; gain: number };

/** Beep at 5, then 3, 2, 1 — skip 4. Used by the workout session tick schedule. */
export const COUNTDOWN_TICK_MARKS_MS = [5000, 3000, 2000, 1000] as const;

/** Pre-recorded natural "Go!" — played through HTMLAudio + the same AVAudioSession as beeps. */
export const GO_CLIP_URL = '/audio/go.wav';

/** Near-max sine family (fundamental + harmonics). Not a square — avoids harsh clipping. */
const TICK: Tone = { freq: 880, dur: 0.15, gain: 1 };
const GO: Tone = { freq: 1175, dur: 0.22, gain: 1 };
const HTML_VOLUME = 1;
const WAV_PEAK = 32767;
const PARTIALS = [
  { ratio: 1, mix: 0.7 },
  { ratio: 2, mix: 0.22 },
  { ratio: 3, mix: 0.08 }
] as const;

let audioCtx: AudioContext | null = null;
let htmlAudio: HTMLAudioElement | null = null;
let goClip: HTMLAudioElement | null = null;
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

function toneSample(tone: Tone, t: number): number {
  let wave = 0;
  for (const partial of PARTIALS) {
    wave += Math.sin(2 * Math.PI * tone.freq * partial.ratio * t) * partial.mix;
  }
  return wave;
}

/** Short notification WAV (GO motif) for the HTMLAudio fallback. */
function pingWavDataUri(tone: Tone): string {
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * tone.dur);
  const samples = new Int16Array(numSamples);
  const peak = Math.min(1, tone.gain);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, t * 80) * Math.min(1, (tone.dur - t) * 20);
    samples[i] = Math.max(-32767, Math.min(32767, Math.round(toneSample(tone, t) * env * WAV_PEAK * peak)));
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

function configureHtmlAudio(el: HTMLAudioElement): void {
  el.preload = 'auto';
  el.volume = HTML_VOLUME;
  el.muted = false;
  el.setAttribute('playsinline', 'true');
}

function isGoClipSrc(src: string): boolean {
  return src.includes('go.wav');
}

function getHtmlAudio(): HTMLAudioElement {
  if (!htmlAudio) {
    htmlAudio = new Audio();
    configureHtmlAudio(htmlAudio);
  }
  return htmlAudio;
}

function getGoClip(): HTMLAudioElement {
  if (!goClip) {
    goClip = new Audio(GO_CLIP_URL);
    configureHtmlAudio(goClip);
  }
  return goClip;
}

/** Unlock HTMLAudio from a user gesture with silence — never the recorded Go clip. */
function primeSilentHtmlAudio(): void {
  try {
    const el = getHtmlAudio();
    el.src = pingWavDataUri({ freq: 1, dur: 0.02, gain: 0 });
    el.muted = true;
    el.volume = 0;
    void el
      .play()
      .then(() => {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
        el.volume = HTML_VOLUME;
      })
      .catch((error) => {
        el.muted = false;
        el.volume = HTML_VOLUME;
        logCueFailure('prime silent HTMLAudio failed', error);
      });
  } catch (error) {
    logCueFailure('prime silent HTMLAudio failed', error);
  }
}

/** Cache go.wav without playing it. Play is reserved for restEndCue / session-start. */
function preloadGoClip(): void {
  try {
    const el = getGoClip();
    if (!el.src || !isGoClipSrc(el.src)) el.src = GO_CLIP_URL;
    el.preload = 'auto';
    el.setAttribute('playsinline', 'true');
    el.load();
  } catch (error) {
    logCueFailure('preload Go clip failed', error);
  }
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

/** Call from a user gesture (Start workout / Complete set / Skip rest). Never plays go.wav. */
export function primeAudio(): void {
  installForegroundResume();
  setCueAudioSession();
  primeSilentHtmlAudio();
  preloadGoClip();
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
    const env = ctx.createGain();
    env.connect(ctx.destination);
    const start = ctx.currentTime;
    const end = start + tone.dur;
    const holdEnd = Math.max(start + 0.02, end - 0.03);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(tone.gain, start + 0.008);
    env.gain.setValueAtTime(tone.gain, holdEnd);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    for (const partial of PARTIALS) {
      const osc = ctx.createOscillator();
      const mix = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = tone.freq * partial.ratio;
      mix.gain.value = partial.mix;
      osc.connect(mix);
      mix.connect(env);
      osc.start(start);
      osc.stop(end + 0.02);
    }
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
    configureHtmlAudio(el);
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

async function playGoClip(): Promise<boolean> {
  setCueAudioSession();
  try {
    const el = getGoClip();
    if (!el.src || !isGoClipSrc(el.src)) el.src = GO_CLIP_URL;
    el.currentTime = 0;
    configureHtmlAudio(el);
    await el.play();
    return true;
  } catch (error) {
    logCueFailure('Go clip play failed', error);
    return false;
  }
}

async function playGoSound(): Promise<void> {
  const clipOk = await playGoClip();
  if (clipOk) return;
  await playTone(GO);
}

async function playNativeHaptic(style: ImpactStyle): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await Haptics.impact({ style });
  } catch (error) {
    logCueFailure(`Haptics.impact(${style}) failed`, error);
  }
}

/** Soft 5 / 3-2-1 tick (no beep at 4). Light haptic on native; web has no tick vibrate. */
export function countdownTick(sound: boolean): void {
  if (sound) void playTone(TICK);
  void playNativeHaptic(ImpactStyle.Light);
}

/** Fire when a rest (or duration) timer elapses. Recorded "Go!" clip (sine fallback). */
export function restEndCue(sound: boolean): void {
  if (sound) void playGoSound();
  void playNativeHaptic(ImpactStyle.Heavy);
  if (isNativePlatform()) return;
  try {
    navigator.vibrate?.([80, 40, 120]);
  } catch (error) {
    logCueFailure('navigator.vibrate failed', error);
  }
}
