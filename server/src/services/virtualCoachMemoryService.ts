import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { getAiProvider } from './aiService.js';

export type MemorySource = 'web_chat' | 'check_in' | 'sms';

export type MemoryFact = {
  id: string;
  text: string;
  source: MemorySource;
  createdAt: string;
  updatedAt: string;
};

export type MemorySessionSummary = {
  id: string;
  source: MemorySource;
  summary: string;
  at: string;
};

export type VirtualCoachMemoryView = {
  motivation: string | null;
  latestCheckInFocus: string | null;
  facts: MemoryFact[];
  sessionSummaries: MemorySessionSummary[];
  updatedAt: string | null;
};

export type MemoryConversationMessage = {
  role: 'user' | 'assistant' | 'coach';
  content: string;
};

const MAX_FACTS = 25;
const MAX_SUMMARIES = 3;

const SHOW_MEMORY_PATTERN =
  /\b(show(?: me)?(?: your)? memory|what do you remember(?: about me)?|what you remember about me|see your memory|view your memory)\b/i;

const FORGET_PATTERN = /\b(forget|delete|remove)\b.*\b(memory|that|about)\b/i;

function parseFacts(value: unknown): MemoryFact[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is MemoryFact =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as MemoryFact).id === 'string' &&
      typeof (entry as MemoryFact).text === 'string'
  );
}

function parseSummaries(value: unknown): MemorySessionSummary[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is MemorySessionSummary =>
      Boolean(entry) &&
      typeof entry === 'object' &&
      typeof (entry as MemorySessionSummary).id === 'string' &&
      typeof (entry as MemorySessionSummary).summary === 'string'
  );
}

function normalizeFactText(text: string) {
  return text.trim().replace(/\s+/g, ' ').slice(0, 280);
}

function factTextsSimilar(a: string, b: string) {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left === right || left.includes(right) || right.includes(left);
}

async function ensureMemoryRow(userId: string) {
  return prisma.virtualCoachMemory.upsert({
    where: { userId },
    create: { userId, facts: [], sessionSummaries: [] },
    update: {}
  });
}

export function isShowMemoryRequest(message: string) {
  return SHOW_MEMORY_PATTERN.test(message.trim());
}

export function isForgetMemoryRequest(message: string) {
  return FORGET_PATTERN.test(message.trim());
}

export function buildMemoryPromptSection(view: VirtualCoachMemoryView) {
  if (!view.facts.length && !view.sessionSummaries.length && !view.motivation && !view.latestCheckInFocus) {
    return '';
  }

  const lines = [
    'COACH MEMORY (user-only; use naturally in conversation — never list unless they ask to see your memory):'
  ];
  if (view.motivation) lines.push(`Core motivation: ${view.motivation}`);
  if (view.latestCheckInFocus) lines.push(`Latest check-in focus: ${view.latestCheckInFocus}`);
  if (view.facts.length) {
    lines.push('Remembered facts:');
    for (const fact of view.facts) lines.push(`- ${fact.text}`);
  }
  if (view.sessionSummaries.length) {
    lines.push('Recent conversations:');
    for (const summary of view.sessionSummaries) lines.push(`- (${summary.source}) ${summary.summary}`);
  }
  lines.push(
    'Reference memory like a caring person — gentle follow-ups when relevant. Do not say "stored in memory" or dump the list unprompted.'
  );
  return lines.join('\n');
}

export function formatMemoryDisplayReply(view: VirtualCoachMemoryView) {
  const sections: string[] = [`Here's what I'm keeping in mind for you:`];

  if (view.motivation) sections.push(`Your why: ${view.motivation}`);
  if (view.latestCheckInFocus) sections.push(`This week's focus: ${view.latestCheckInFocus}`);

  if (view.facts.length) {
    sections.push('', 'Things I remember:');
    for (const fact of view.facts) sections.push(`• ${fact.text}`);
  } else {
    sections.push('', "No personal facts saved yet — I'll pick up important details as we talk.");
  }

  if (view.sessionSummaries.length) {
    sections.push('', 'Recent conversations:');
    for (const summary of view.sessionSummaries) {
      const label = summary.source === 'check_in' ? 'Check-in' : summary.source === 'sms' ? 'Text' : 'Chat';
      sections.push(`• ${label}: ${summary.summary}`);
    }
  }

  sections.push('', 'You can tell me to forget or correct anything anytime.');
  return sections.join('\n');
}

export async function getVirtualCoachMemoryView(userId: string): Promise<VirtualCoachMemoryView> {
  const [row, profile, latestCheckIn] = await Promise.all([
    prisma.virtualCoachMemory.findUnique({ where: { userId } }),
    prisma.clientProfile.findUnique({ where: { userId }, select: { motivation: true } }),
    prisma.virtualCoachCheckIn.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: { focus: true }
    })
  ]);

  return {
    motivation: profile?.motivation ?? null,
    latestCheckInFocus: latestCheckIn?.focus ?? null,
    facts: parseFacts(row?.facts),
    sessionSummaries: parseSummaries(row?.sessionSummaries),
    updatedAt: row?.updatedAt.toISOString() ?? null
  };
}

export async function updateMemoryFact(userId: string, factId: string, text: string) {
  const row = await ensureMemoryRow(userId);
  const facts = parseFacts(row.facts);
  const index = facts.findIndex((fact) => fact.id === factId);
  if (index < 0) throw new Error('Memory fact not found.');

  const trimmed = normalizeFactText(text);
  if (!trimmed) throw new Error('Memory text is required.');

  facts[index] = { ...facts[index], text: trimmed, updatedAt: new Date().toISOString() };
  await prisma.virtualCoachMemory.update({
    where: { userId },
    data: { facts }
  });
  return getVirtualCoachMemoryView(userId);
}

export async function deleteMemoryFact(userId: string, factId: string) {
  const row = await ensureMemoryRow(userId);
  const facts = parseFacts(row.facts).filter((fact) => fact.id !== factId);
  if (facts.length === parseFacts(row.facts).length) throw new Error('Memory fact not found.');

  await prisma.virtualCoachMemory.update({
    where: { userId },
    data: { facts }
  });
  return getVirtualCoachMemoryView(userId);
}

export function mergeExtractedMemory(
  existingFacts: MemoryFact[],
  existingSummaries: MemorySessionSummary[],
  extraction: {
    newFacts: string[];
    removeFactTexts: string[];
    sessionSummary?: string | null;
  },
  source: MemorySource
) {
  const now = new Date().toISOString();
  let facts = [...existingFacts];

  if (extraction.removeFactTexts.length) {
    facts = facts.filter(
      (fact) => !extraction.removeFactTexts.some((removeText) => factTextsSimilar(fact.text, removeText))
    );
  }

  for (const raw of extraction.newFacts) {
    const text = normalizeFactText(raw);
    if (!text) continue;
    if (facts.some((fact) => factTextsSimilar(fact.text, text))) continue;
    facts.push({ id: randomUUID(), text, source, createdAt: now, updatedAt: now });
  }

  if (facts.length > MAX_FACTS) {
    facts = facts.slice(facts.length - MAX_FACTS);
  }

  let sessionSummaries = [...existingSummaries];
  const summaryText = extraction.sessionSummary?.trim();
  if (summaryText) {
    sessionSummaries = [
      { id: randomUUID(), source, summary: summaryText.slice(0, 800), at: now },
      ...sessionSummaries
    ].slice(0, MAX_SUMMARIES);
  }

  return { facts, sessionSummaries };
}

export async function applyMemoryExtraction(
  userId: string,
  source: MemorySource,
  messages: MemoryConversationMessage[]
) {
  if (messages.length < 2) return;

  const row = await ensureMemoryRow(userId);
  const existingFacts = parseFacts(row.facts);
  const existingSummaries = parseSummaries(row.sessionSummaries);

  try {
    const extraction = await getAiProvider().extractCoachMemory({
      existingFacts: existingFacts.map((fact) => fact.text),
      existingSummaries: existingSummaries.map((summary) => summary.summary),
      source,
      messages
    });
    const merged = mergeExtractedMemory(existingFacts, existingSummaries, extraction, source);
    await prisma.virtualCoachMemory.update({
      where: { userId },
      data: merged
    });
  } catch (error) {
    console.error('Coach memory extraction failed', error);
  }
}

/** Serialize memory extraction per user so concurrent writes do not clobber each other. */
const memoryExtractionChains = new Map<string, Promise<void>>();

function enqueueMemoryExtraction(userId: string, task: () => Promise<void>) {
  const previous = memoryExtractionChains.get(userId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      if (memoryExtractionChains.get(userId) === next) {
        memoryExtractionChains.delete(userId);
      }
    });
  memoryExtractionChains.set(userId, next);
  return next;
}

export async function awaitMemoryExtraction(
  userId: string,
  source: MemorySource,
  messages: MemoryConversationMessage[]
) {
  return enqueueMemoryExtraction(userId, () => applyMemoryExtraction(userId, source, messages));
}

/** Fire-and-forget memory extraction — must never block or fail the caller. */
export function scheduleMemoryExtraction(
  userId: string,
  source: MemorySource,
  messages: MemoryConversationMessage[]
) {
  void enqueueMemoryExtraction(userId, () => applyMemoryExtraction(userId, source, messages));
}

export function transcriptToMemoryMessages(
  messages: Array<{ role: string; content: string }>
): MemoryConversationMessage[] {
  return messages
    .filter((entry) => typeof entry.content === 'string' && entry.content.trim())
    .map((entry) => ({
      role: entry.role === 'coach' ? 'coach' : entry.role === 'user' ? 'user' : 'assistant',
      content: entry.content.trim()
    }));
}
