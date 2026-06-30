import { env } from '../config/env.js';

/**
 * Per-coach OpenAI TTS voice + delivery instructions. Voices are from the OpenAI
 * speech API (gpt-4o-mini-tts supports an `instructions` field to shape delivery).
 */
const COACH_TTS_VOICE: Record<string, string> = {
  nora: 'coral',
  tess: 'nova',
  kali: 'shimmer',
  finn: 'echo',
  milo: 'ash',
  mets: 'onyx'
};

const COACH_TTS_INSTRUCTIONS: Record<string, string> = {
  nora: 'Warm, upbeat 35-year-old female nutrition coach. Friendly and encouraging, like a knowledgeable friend. Natural conversational pacing, never robotic.',
  tess: 'Energetic, upbeat 35-year-old female accountability coach. Positive and motivating, with a lively, friendly cadence.',
  kali: 'Calm, warm older female wellness guide with gentle, grounded island warmth. Unhurried and soothing.',
  finn: 'Calm, focused 35-year-old male performance coach. Clear, steady, and analytical but friendly.',
  milo: 'Friendly, easygoing 35-year-old male coach. Approachable, relaxed, and encouraging.',
  mets: 'Wise, older male mentor with calm authority and warmth. Measured, thoughtful, and reassuring.'
};

const DEFAULT_VOICE = 'coral';
const TTS_MODEL = 'gpt-4o-mini-tts';
const MAX_TTS_CHARS = 1200;

export function isCoachVoiceConfigured() {
  return Boolean(env.OPENAI_API_KEY);
}

/** Synthesizes coach speech as MP3 audio via OpenAI TTS. Throws if no key or the API fails. */
export async function synthesizeCoachSpeech(coachId: string, text: string): Promise<Buffer> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const voice = COACH_TTS_VOICE[coachId] ?? DEFAULT_VOICE;
  const instructions = COACH_TTS_INSTRUCTIONS[coachId];
  const input = text.trim().slice(0, MAX_TTS_CHARS);
  if (!input) throw new Error('No text to speak');

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice,
      input,
      instructions,
      response_format: 'mp3'
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI TTS failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
