import {
  type VirtualCoachId,
  type CoachNameUsagePolicy,
  VIRTUAL_COACH_NAME_USAGE,
  isVirtualCoachId
} from '../data/virtualCoachPersonas.js';

export type { CoachNameUsagePolicy };

export function resolveCoachNameUsage(coachId: VirtualCoachId | null | undefined): CoachNameUsagePolicy {
  if (coachId && isVirtualCoachId(coachId)) {
    return VIRTUAL_COACH_NAME_USAGE[coachId];
  }
  return VIRTUAL_COACH_NAME_USAGE.milo;
}

export function shouldCoachUseFirstName(
  coachMessageNumber: number,
  policy: CoachNameUsagePolicy,
  opts?: { isRecapClosing?: boolean }
): boolean {
  if (opts?.isRecapClosing && policy.alwaysOnRecap) return true;
  if (coachMessageNumber === 1 && policy.alwaysOnOpening) return true;
  const interval = Math.max(1, policy.nameEveryNthCoachMessage);
  return (coachMessageNumber - 1) % interval === 0;
}

export function buildCoachNameUsageInstruction(
  coachMessageNumber: number,
  firstName: string | null | undefined,
  policy: CoachNameUsagePolicy,
  opts?: { isRecapClosing?: boolean }
): string {
  const name = firstName?.trim();
  if (!name) return '';

  if (shouldCoachUseFirstName(coachMessageNumber, policy, opts)) {
    return coachMessageNumber === 1
      ? `Name usage: this is your opening line — greet them by first name (${name}).`
      : `Name usage: include their first name (${name}) naturally in this message.`;
  }
  return `Name usage: do not use their first name (${name}) in this message.`;
}

/** Long-form name cadence for check-in system prompts. */
export function buildCoachNameUsagePromptLine(firstName: string, policy: CoachNameUsagePolicy): string {
  const interval = Math.max(1, policy.nameEveryNthCoachMessage);
  const examples = [1, 1 + interval, 1 + interval * 2].join(', ');
  return `The user's first name is ${firstName}. Always greet them by name on your opening line. After that, use their name on coach messages ${examples}, … (every ${interval} coach messages starting with the first). Keep it natural — never robotic.`;
}

function messageIncludesName(message: string, firstName: string) {
  const escaped = firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(message);
}

function stripCoachName(message: string, firstName: string): string {
  const escaped = firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = message;
  out = out.replace(new RegExp(`\\b(hey|hi|hello|okay|ok|alright|well|so|oh)\\s+${escaped}\\b`, 'gi'), '$1');
  out = out.replace(new RegExp(`\\s*,\\s*${escaped}\\b(?!['’]s)`, 'gi'), '');
  out = out.replace(new RegExp(`\\b${escaped}\\b(?!['’]s)\\s*,\\s*`, 'gi'), '');
  out = out.replace(new RegExp(`\\b${escaped}\\b(?!['’]s)[!.]?`, 'gi'), '');
  out = out
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/^[\s,]+/, '')
    .trim();
  if (out) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out || message;
}

function ensureCoachUsesName(message: string, firstName: string, isOpening: boolean): string {
  if (messageIncludesName(message, firstName)) return message;
  const trimmed = message.trim();
  if (isOpening) {
    return `Hi ${firstName}. ${trimmed}`;
  }
  return `${firstName}, ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

/** Enforce per-coach name cadence on a coach reply (add or strip first name). */
export function applyCoachNameUsage(
  message: string,
  firstName: string | null | undefined,
  coachMessageNumber: number,
  policy: CoachNameUsagePolicy,
  opts?: { isRecapClosing?: boolean }
): string {
  const name = firstName?.trim();
  if (!message || !name) return message;

  const keepName = shouldCoachUseFirstName(coachMessageNumber, policy, opts);
  if (keepName) {
    return ensureCoachUsesName(message, name, coachMessageNumber === 1);
  }
  return stripCoachName(message, name);
}
