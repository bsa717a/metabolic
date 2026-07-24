/**
 * Unified coach conversation log shared by the web chat and the SMS/iMessage coach.
 *
 * Both channels append their turns here so the coach remembers across page refreshes and across
 * channels: a meal discussed over text can be continued on the web and vice versa. `SmsMessage`
 * stays the operational log for SMS delivery status and pending-action bookkeeping; this table is
 * the conversational transcript the model reads.
 */
import { CoachChannel, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import type { ChatMessage } from './aiService.js';

export type CoachToolCallMeta = { name: string; args?: Record<string, unknown> };

/** How many recent turns to feed the model as verbatim context (memory summaries cover the rest). */
export const COACH_HISTORY_TURN_LIMIT = 30;

/** Append one turn to the unified conversation. Never throws — a logging failure must not break chat. */
export async function recordCoachMessage(
  userId: string,
  channel: CoachChannel,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: CoachToolCallMeta[]
): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) return;
  try {
    await prisma.coachMessage.create({
      data: {
        userId,
        channel,
        role,
        content: trimmed,
        toolCalls: toolCalls && toolCalls.length ? (toolCalls as unknown as Prisma.InputJsonValue) : undefined
      }
    });
  } catch {
    // Transcript persistence is best-effort; the live reply already went out.
  }
}

/** Append a user turn and the assistant reply together, preserving order. */
export async function recordCoachExchange(
  userId: string,
  channel: CoachChannel,
  userContent: string,
  assistantContent: string,
  toolCalls?: CoachToolCallMeta[]
): Promise<void> {
  await recordCoachMessage(userId, channel, 'user', userContent);
  await recordCoachMessage(userId, channel, 'assistant', assistantContent, toolCalls);
}

/**
 * Loads the most recent turns of the unified conversation (both channels), oldest→newest, so the
 * model sees one continuous thread. Returns an empty array on any failure so callers can fall back
 * to whatever transcript they already have.
 */
export async function loadCoachConversation(
  userId: string,
  limit = COACH_HISTORY_TURN_LIMIT
): Promise<ChatMessage[]> {
  try {
    const rows = await prisma.coachMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    return rows
      .reverse()
      .map((row) => ({ role: row.role === 'assistant' ? 'assistant' : 'user', content: row.content }));
  } catch {
    return [];
  }
}
