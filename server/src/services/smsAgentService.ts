/**
 * Conversational SMS orchestrator. Runs a Gemini tool-calling loop over the user's
 * program data + recent texts, reusing the existing SMS handlers as tools.
 *
 * Timing: answer in a single synchronous message whenever the agent finishes inside
 * SYNC_AGENT_BUDGET_MS (returned as TwiML — no extra Twilio API call, no ACK). Only when
 * the work exceeds the budget do we defer: return immediately and deliver the reply via the
 * outbound REST API once it's ready (with a "still working" ACK for photos, which run vision).
 */
import { CoachChannel, SmsDirection } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { userDayKey } from '../utils/dates.js';
import { getAiProvider, type ChatMessage } from './aiService.js';
import { buildSmsAssistantContext } from './assistantService.js';
import {
  loadCoachConversation,
  recordCoachMessage,
  type CoachToolCallMeta
} from './coachConversationService.js';
import { isTwilioConfigured, sendOutboundMessage, type TwilioMessageChannel } from './twilioOutboundService.js';
import {
  SmsResponseError,
  capSms,
  downloadSmsImage,
  handleWriteAction,
  loadSmsChatHistory,
  sendPhotoProcessingAck,
  type HandleSmsResult,
  type SmsMedia,
  type SmsUser
} from './smsIntentService.js';
import { isWaterOnlySmsCommand, parseWaterAmountOz } from '../utils/waterParse.js';
import { buildSmsToolDeclarations, executeSmsTool, type SmsToolContext } from './smsAgentTools.js';
import {
  PENDING_ACTION_DONE_INTENT,
  isPendingActionFresh,
  parsePendingAction,
  serializePendingAction,
  serializePhotoEstimateIntent,
  type PendingAction
} from '../utils/smsFoodParse.js';

/** How long we'll hold the webhook open trying to answer in one synchronous message. */
const SYNC_AGENT_BUDGET_MS = 9_000;
/** Hard ceiling on the whole agent loop, including background (deferred) completion. */
const AGENT_HARD_TIMEOUT_MS = 25_000;
const SLOW_TEXT_ACK = 'Working on that — I will text you back in a moment.';

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  abort?: AbortController
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      abort?.abort();
      reject(new Error(`${label} timed out`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function agentErrorReply(error: unknown): string {
  if (error instanceof SmsResponseError) return error.message;
  const detail = error instanceof Error ? error.message : 'Assistant unavailable';
  return capSms(`Sorry, I could not answer that right now. ${detail}`);
}

/** The final user turn we hand the model — text plus a note when a photo is (or should be) attached. */
function buildAgentMessage(text: string, isPhoto: boolean, mediaMissing: boolean): string {
  if (isPhoto) {
    const note = '[The user attached a meal photo with this message.]';
    return text ? `${text}\n\n${note}` : note;
  }
  if (mediaMissing) {
    const note = '[The user tried to attach a meal photo but it could not be loaded.]';
    return text ? `${text}\n\n${note}` : note;
  }
  return text;
}

/** Decide what to stash on the outbound row: a pending clarification, and/or a photo estimate for "log that". */
function computeOutboundIntent(ctx: SmsToolContext): string | undefined {
  const photo = ctx.photoEstimate;
  const photoStash =
    photo && !photo.logged && photo.items.length
      ? { items: photo.items, mealName: photo.mealName }
      : undefined;

  if (ctx.pendingAction) {
    return serializePendingAction({
      ...ctx.pendingAction,
      createdAt: Date.now(),
      photoEstimate: photoStash
    });
  }

  if (photoStash) {
    return serializePhotoEstimateIntent(photoStash.items, photoStash.mealName);
  }

  return undefined;
}

function pendingWasResolved(toolCtx: SmsToolContext, pending?: PendingAction) {
  if (!pending) return false;
  return toolCtx.toolCalls.some((call) => call.name === pending.tool);
}

type PersistArgs = {
  inboundId: string;
  user: SmsUser;
  phone: string;
  reply: string;
  toolCtx: SmsToolContext;
  resumedPending?: PendingAction;
  resumedPendingId?: string;
};

async function persistAgentReply({ inboundId, user, phone, reply, toolCtx, resumedPending, resumedPendingId }: PersistArgs) {
  const intent = computeOutboundIntent(toolCtx);
  await prisma.smsMessage.update({ where: { id: inboundId }, data: { status: 'PROCESSED', response: reply } });
  await prisma.smsMessage.create({
    data: { phone, userId: user.id, direction: 'OUTBOUND', message: reply, response: reply, intent, status: 'PROCESSED' }
  });
  // Mirror the reply into the unified thread so the web coach sees this SMS turn too.
  await recordCoachMessage(user.id, CoachChannel.SMS, 'assistant', reply, toolCtx.toolCalls as CoachToolCallMeta[]);
  if (resumedPendingId && pendingWasResolved(toolCtx, resumedPending)) {
    await prisma.smsMessage
      .update({ where: { id: resumedPendingId }, data: { intent: PENDING_ACTION_DONE_INTENT } })
      .catch(() => undefined);
  }
}

export async function runSmsAgentEntry(
  user: SmsUser,
  phone: string,
  message: string,
  media: SmsMedia | undefined,
  channel: TwilioMessageChannel,
  mediaMissing: boolean
): Promise<HandleSmsResult> {
  const isPhoto = Boolean(media);
  const trimmed = message.trim();
  const inboundMessage = trimmed || (isPhoto || mediaMissing ? '[Meal photo]' : '');
  const inbound = await prisma.smsMessage.create({
    data: { phone, userId: user.id, direction: 'INBOUND', message: inboundMessage, intent: 'AGENT' }
  });
  // Mirror the inbound text into the unified thread before loading history so this turn is included.
  await recordCoachMessage(user.id, CoachChannel.SMS, 'user', inboundMessage);

  const lastOutbound = await prisma.smsMessage.findFirst({
    where: { userId: user.id, phone, direction: SmsDirection.OUTBOUND },
    orderBy: { createdAt: 'desc' }
  });
  const pending = parsePendingAction(lastOutbound?.intent ?? null);
  const activePending = pending && isPendingActionFresh(pending, Date.now()) ? { id: lastOutbound!.id, pending } : null;

  // Read the unified thread (web + SMS) so texting continues a conversation started on the web and
  // vice versa. Fall back to the SMS-only log for users who have no unified history yet.
  const unified = await loadCoachConversation(user.id, 16);
  const history = unified.length ? unified : await loadSmsChatHistory(user.id, phone);
  const priorTurns = history.at(-1)?.role === 'user' ? history.slice(0, -1) : history;
  const agentMessage = buildAgentMessage(trimmed, isPhoto, mediaMissing);
  const messages: ChatMessage[] = [...priorTurns, { role: 'user', content: agentMessage }];

  let context = await buildSmsAssistantContext(user.id);
  if (activePending) {
    context += `\n\npendingAction (the user's latest message is answering this): ${JSON.stringify(activePending.pending)}`;
  }

  const toolCtx: SmsToolContext = {
    userId: user.id,
    phone,
    dateKey: userDayKey(user.timezone),
    timeZone: user.timezone,
    message: trimmed,
    media,
    toolCalls: []
  };

  const persistArgs = {
    inboundId: inbound.id,
    user,
    phone,
    toolCtx,
    resumedPending: activePending?.pending,
    resumedPendingId: activePending?.id
  };

  if (trimmed && !isPhoto && !mediaMissing && isWaterOnlySmsCommand(trimmed)) {
    const amountOz = parseWaterAmountOz(trimmed)!;
    try {
      const reply = capSms(
        await handleWriteAction(user.id, toolCtx.dateKey, toolCtx.timeZone, {
          intent: 'LOG_WATER',
          amountOz,
          text: trimmed
        })
      );
      toolCtx.toolCalls.push({ name: 'log_water', args: { amountOz, text: trimmed } });
      await persistAgentReply({ ...persistArgs, reply });
      return { inbound, response: reply };
    } catch (error) {
      const reply = agentErrorReply(error);
      await persistAgentReply({ ...persistArgs, reply });
      return { inbound, response: reply };
    }
  }

  const abort = new AbortController();
  const work = (async (): Promise<string> => {
    if (media) {
      try {
        toolCtx.image = await downloadSmsImage(media);
      } catch (error) {
        toolCtx.imageError = error instanceof Error ? error.message : 'Could not download the photo.';
      }
    } else if (mediaMissing) {
      toolCtx.imageError = 'The attached photo could not be loaded.';
    }

    try {
      const raw = await withTimeout(
        getAiProvider().runAgent({
          messages,
          context,
          tools: buildSmsToolDeclarations(),
          abortSignal: abort.signal,
          toolExecutor: (name, args) => {
            if (abort.signal.aborted) {
              return Promise.resolve({ error: 'Request cancelled.' });
            }
            return executeSmsTool(toolCtx, name, args, abort.signal);
          }
        }),
        AGENT_HARD_TIMEOUT_MS,
        'SMS assistant',
        abort
      );
      // runAgent already returns an honest message when the model produces nothing, so never
      // fabricate a bare "Got it!" that reads like we acted or answered when we didn't.
      return capSms(raw) || "Sorry, I didn't catch that — mind sending it again?";
    } catch (error) {
      abort.abort();
      return agentErrorReply(error);
    }
  })();

  const TIMEOUT = Symbol('budget');
  const outcome = await Promise.race([
    work.then((reply) => ({ reply })),
    new Promise<typeof TIMEOUT>((resolve) => setTimeout(() => resolve(TIMEOUT), SYNC_AGENT_BUDGET_MS))
  ]);

  if (outcome !== TIMEOUT) {
    const { reply } = outcome as { reply: string };
    await persistAgentReply({ ...persistArgs, reply });
    return { inbound, response: reply };
  }

  let ackResponse = '';
  if (isPhoto) {
    const { ack, deliveredViaApi } = await sendPhotoProcessingAck(user, phone, inbound.id, channel);
    ackResponse = deliveredViaApi ? '' : ack;
  } else {
    const interim = capSms(SLOW_TEXT_ACK);
    if (isTwilioConfigured()) {
      await sendOutboundMessage(phone, interim, channel).catch(() => undefined);
    } else {
      ackResponse = interim;
    }
  }

  return {
    inbound,
    response: ackResponse,
    deferredWork: async () => {
      let reply: string;
      try {
        reply = await work;
      } catch (error) {
        abort.abort();
        reply = agentErrorReply(error);
      }
      await persistAgentReply({ ...persistArgs, reply });
      if (isTwilioConfigured()) {
        await sendOutboundMessage(phone, reply, channel).catch(() => undefined);
      }
    }
  };
}
