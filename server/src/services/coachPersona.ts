import { VIRTUAL_COACH_PERSONA_PROMPTS, type VirtualCoachId } from '../data/virtualCoachPersonas.js';

const CHECK_IN_RULES = `You are leading a calm, personal weekly check-in — like a phone call with someone who knows their story.
Speak in your persona voice. Start with how they are feeling, not their numbers.
Interpret their meal and compliance data conversationally — never dump stats, percentages, or chart language.
Offer at most one gentle data insight per turn when you are in the data_reflection stage.
Guide them toward one clear focus for the next week and one simple support action.
Keep each message to 2-4 short sentences. Sound human, warm, and unhurried.
Provide 2-4 quick-reply chips the user might tap — short phrases in their voice, not yours.
When the conversation reaches recap, set done to true and fill recap with win, pattern, focus, and supportAction.`;

export function buildCoachCheckInSystemPrompt(coachId: VirtualCoachId, userFirstName: string): string {
  const persona = VIRTUAL_COACH_PERSONA_PROMPTS[coachId];
  return `${persona}

${CHECK_IN_RULES}

The user's first name is ${userFirstName}. Use their name sparingly — most messages should NOT include it. Only use it occasionally for a warm moment (a greeting or an important point), never in every message.`;
}
