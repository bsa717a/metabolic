import { useCallback, useEffect, useRef, useState } from 'react';
import type { VirtualCoachId } from '../data/virtualCoaches';
import { api } from '../services/api';
import { getIdToken } from '../services/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript?: string } } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionCtor;
    SpeechRecognition?: SpeechRecognitionCtor;
  }
}

type VoiceProfile = {
  /** Preferred voice names in priority order (matched case-insensitively, substring). */
  names: string[];
  gender: 'female' | 'male';
  lang: string;
  pitch: number;
  rate: number;
};

// Known natural-sounding voice names across macOS / iOS / Chrome / Windows.
const FEMALE_VOICE_NAMES = [
  'samantha',
  'ava',
  'allison',
  'susan',
  'nicky',
  'google us english',
  'jenny',
  'aria',
  'zira',
  'michelle',
  'victoria',
  'serena',
  'tessa',
  'fiona',
  'karen',
  'moira',
  'female'
];

const MALE_VOICE_NAMES = [
  'daniel',
  'alex',
  'fred',
  'aaron',
  'tom',
  'arthur',
  'oliver',
  'rishi',
  'google uk english male',
  'david',
  'mark',
  'male'
];

const COACH_VOICE: Record<VirtualCoachId, VoiceProfile> = {
  // Nora: warm 35-year-old female — natural US English, slightly brighter pitch.
  nora: { names: ['samantha', 'ava', 'allison', 'google us english', 'jenny', 'aria', 'zira'], gender: 'female', lang: 'en-US', pitch: 1.12, rate: 1.0 },
  tess: { names: ['ava', 'samantha', 'jenny', 'aria', 'zira'], gender: 'female', lang: 'en-US', pitch: 1.16, rate: 1.05 },
  kali: { names: ['samantha', 'karen', 'moira', 'susan'], gender: 'female', lang: 'en-US', pitch: 1.02, rate: 0.95 },
  finn: { names: ['daniel', 'alex', 'aaron', 'tom'], gender: 'male', lang: 'en-US', pitch: 1.0, rate: 1.0 },
  milo: { names: ['alex', 'fred', 'aaron', 'daniel'], gender: 'male', lang: 'en-US', pitch: 1.04, rate: 1.02 },
  mets: { names: ['daniel', 'oliver', 'arthur', 'alex'], gender: 'male', lang: 'en-GB', pitch: 0.96, rate: 0.94 }
};

function voiceProfile(coachId: VirtualCoachId): VoiceProfile {
  return COACH_VOICE[coachId] ?? COACH_VOICE.nora;
}

function pickVoice(coachId: VirtualCoachId) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const profile = voiceProfile(coachId);
  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  const pool = englishVoices.length ? englishVoices : voices;

  // 1. Preferred named voices, in order.
  for (const name of profile.names) {
    const match = pool.find((voice) => voice.name.toLowerCase().includes(name));
    if (match) return match;
  }

  // 2. Any voice that matches the desired gender by known name.
  const genderNames = profile.gender === 'female' ? FEMALE_VOICE_NAMES : MALE_VOICE_NAMES;
  const genderMatch = pool.find((voice) => genderNames.some((name) => voice.name.toLowerCase().includes(name)));
  if (genderMatch) return genderMatch;

  // 3. Prefer the coach's language, then any English voice, then anything.
  return (
    pool.find((voice) => voice.lang.toLowerCase().startsWith(profile.lang.toLowerCase().slice(0, 2))) ??
    pool[0] ??
    voices[0] ??
    null
  );
}

function voiceStorageKey(coachId: VirtualCoachId) {
  return `metabolic.coachVoice.${coachId}`;
}

function readStoredVoiceURI(coachId: VirtualCoachId): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(voiceStorageKey(coachId));
  } catch {
    return null;
  }
}

export function useSpeech(coachId: VirtualCoachId) {
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURIState] = useState<string | null>(() => readStoredVoiceURI(coachId));
  const [naturalAvailable, setNaturalAvailable] = useState(false);
  const [naturalVoice, setNaturalVoice] = useState(true);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setVoiceURIState(readStoredVoiceURI(coachId));
  }, [coachId]);

  useEffect(() => {
    let cancelled = false;
    api<{ available: boolean }>('/api/ai/coach-voice/available')
      .then((result) => {
        if (!cancelled) setNaturalAvailable(result.available);
      })
      .catch(() => {
        if (!cancelled) setNaturalAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const synthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSpeechSupported(synthesisSupported || Boolean(Recognition));

    if (synthesisSupported) {
      const loadVoices = () => {
        const available = window.speechSynthesis.getVoices();
        if (available.length) setVoices(available);
      };
      loadVoices();
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
      return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    }
  }, []);

  // English voices first, then the rest — what we offer in the selector.
  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  const selectableVoices = englishVoices.length ? englishVoices : voices;

  const resolveVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const all = voices.length ? voices : window.speechSynthesis.getVoices();
    if (voiceURI) {
      const chosen = all.find((voice) => voice.voiceURI === voiceURI);
      if (chosen) return chosen;
    }
    return pickVoice(coachId);
  }, [coachId, voiceURI, voices]);

  const setVoiceURI = useCallback(
    (uri: string) => {
      setVoiceURIState(uri);
      try {
        window.localStorage.setItem(voiceStorageKey(coachId), uri);
      } catch {
        // ignore storage failures (private mode, etc.)
      }
    },
    [coachId]
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
  }, []);

  const browserSpeak = useCallback(
    (text: string) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const profile = voiceProfile(coachId);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = profile.rate;
      utterance.pitch = profile.pitch;
      utterance.lang = profile.lang;
      const voice = resolveVoice();
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      window.speechSynthesis.speak(utterance);
    },
    [coachId, resolveVoice]
  );

  const playNatural = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        const token = await getIdToken();
        const response = await fetch(`${API_URL}/api/ai/coach-voice`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ text, coachId })
        });
        if (!response.ok) return false;
        const blob = await response.blob();
        if (audioRef.current) audioRef.current.pause();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (audioRef.current === audio) audioRef.current = null;
        };
        await audio.play();
        return true;
      } catch {
        return false;
      }
    },
    [coachId]
  );

  const speak = useCallback(
    (text: string) => {
      if (muted || typeof window === 'undefined') return;
      stopSpeaking();
      if (naturalVoice && naturalAvailable) {
        // Fall back to the browser voice for THIS line only if the natural audio
        // fails to play (e.g. a transient autoplay block). Do not permanently
        // disable the natural voice — the next line (after a user gesture) retries.
        void playNatural(text).then((ok) => {
          if (!ok) browserSpeak(text);
        });
        return;
      }
      browserSpeak(text);
    },
    [muted, stopSpeaking, naturalVoice, naturalAvailable, playNatural, browserSpeak]
  );

  const startListening = useCallback(
    (onResult: (text: string) => void, onError?: (message: string) => void) => {
      const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!Recognition) {
        onError?.('Voice input is not supported in this browser.');
        return;
      }

      stopSpeaking();
      const recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript?.trim();
        if (transcript) onResult(transcript);
        setListening(false);
      };
      recognition.onerror = () => {
        setListening(false);
        onError?.('Could not capture voice. Try typing instead.');
      };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      setListening(true);
      recognition.start();
    },
    [stopSpeaking]
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  return {
    speechSupported,
    listening,
    muted,
    setMuted,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    voices: selectableVoices,
    voiceURI: resolveVoice()?.voiceURI ?? null,
    setVoiceURI,
    naturalAvailable,
    naturalVoice,
    setNaturalVoice
  };
}
