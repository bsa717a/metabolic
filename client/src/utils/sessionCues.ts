/**
 * Audio + haptic cues for the workout session. The AudioContext must be created
 * from a user gesture (the Start-workout tap) or iOS keeps it suspended, so call
 * {@link primeAudio} from that handler before any {@link restEndCue}.
 */

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

let audioCtx: AudioContext | null = null;

export function primeAudio(): void {
  try {
    const Ctx = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!audioCtx && Ctx) audioCtx = new Ctx();
    if (audioCtx?.state === 'suspended') void audioCtx.resume();
  } catch {
    // audio unavailable — cues degrade to vibration only
  }
}

function beep(): void {
  try {
    if (!audioCtx) primeAudio();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.start(t);
    osc.stop(t + 0.42);
  } catch {
    // ignore
  }
}

/** Fire when a rest timer elapses: a short beep (if enabled) plus a vibration. */
export function restEndCue(sound: boolean): void {
  if (sound) beep();
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    // vibration unsupported — ignore
  }
}
