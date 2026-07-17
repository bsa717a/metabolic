import { useEffect, useRef, useState } from 'react';
import { Brain, SendHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import type { VirtualCoach } from '../../data/virtualCoaches';
import type { Dashboard, Meal } from '../../types';
import { api } from '../../services/api';
import { buildCoachChatOpeningMessage } from './coachChatGreeting';
import {
  formatMealDetailForChat,
  MEAL_PICKER_PROMPT,
  mealPickerQuickReplies,
  quickReplyDisplayLabel,
  type CoachWelcomeQuickReply
} from './coachWelcomeMealFlow';

export type CoachChatMessage = { role: 'user' | 'assistant'; content: string };

export type CoachChatQuickReply = CoachWelcomeQuickReply;

export function CoachChatBox({
  coach,
  initialMessages = [],
  onUserMessage,
  quickReplies,
  autoGreeting = false,
  userFirstName,
  className
}: {
  coach: VirtualCoach;
  initialMessages?: CoachChatMessage[];
  onUserMessage?: (text: string) => void;
  quickReplies?: CoachChatQuickReply[];
  autoGreeting?: boolean;
  userFirstName?: string | null;
  className?: string;
}) {
  const [messages, setMessages] = useState<CoachChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [greetingLoading, setGreetingLoading] = useState(autoGreeting && initialMessages.length === 0);
  const [error, setError] = useState<string>();
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [activeQuickReplies, setActiveQuickReplies] = useState<CoachChatQuickReply[] | null>(null);
  const [pickerMeals, setPickerMeals] = useState<Meal[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!autoGreeting || initialMessages.length > 0) return;

    let cancelled = false;
    setGreetingLoading(true);

    void (async () => {
      try {
        const dashboard = await api<Dashboard>('/api/dashboard/today');
        if (cancelled) return;
        setMessages([
          {
            role: 'assistant',
            content: buildCoachChatOpeningMessage(userFirstName, dashboard.meals ?? [])
          }
        ]);
      } catch {
        if (cancelled) return;
        setMessages([
          {
            role: 'assistant',
            content: buildCoachChatOpeningMessage(userFirstName, [])
          }
        ]);
      } finally {
        if (!cancelled) setGreetingLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [autoGreeting, initialMessages.length, userFirstName]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, loading, activeQuickReplies?.length]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  function appendMessages(next: CoachChatMessage[]) {
    setMessages((current) => [...current, ...next]);
  }

  async function startMealReviewFlow(reply: CoachChatQuickReply) {
    const label = quickReplyDisplayLabel(reply);
    appendMessages([{ role: 'user', content: label }]);
    onUserMessage?.(label);
    setError(undefined);
    setLoading(true);

    try {
      const dashboard = await api<Dashboard>('/api/dashboard/today');
      const meals = dashboard.meals ?? [];
      if (!meals.length) {
        appendMessages([
          {
            role: 'assistant',
            content:
              "You don't have any meals on today's plan yet. Head to the Nutrition page to build your day, then come back and we can walk through them."
          }
        ]);
        return;
      }

      setPickerMeals(meals);
      setActiveQuickReplies(mealPickerQuickReplies(meals));
      appendMessages([{ role: 'assistant', content: MEAL_PICKER_PROMPT }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function showMealDetail(reply: CoachChatQuickReply) {
    appendMessages([{ role: 'user', content: reply.label }]);
    onUserMessage?.(reply.label);

    const meal = reply.mealId
      ? pickerMeals.find((entry) => entry.id === reply.mealId)
      : pickerMeals.find((entry) => entry.name === reply.message) ??
        pickerMeals.find((entry) => entry.name.toLowerCase() === reply.message.toLowerCase());

    if (!meal) {
      appendMessages([
        {
          role: 'assistant',
          content: `I couldn't find ${reply.label} on today's plan. Pick one of the meals below.`
        }
      ]);
      return;
    }

    appendMessages([{ role: 'assistant', content: formatMealDetailForChat(meal) }]);
    setPickerMeals([]);
    setActiveQuickReplies(null);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextMessages: CoachChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setError(undefined);
    setLoading(true);
    onUserMessage?.(trimmed);

    try {
      const result = await api<{ reply: string; hydrationGoalUpdated?: boolean }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: nextMessages })
      });
      setMessages([...nextMessages, { role: 'assistant', content: result.reply }]);
      if (result.hydrationGoalUpdated) {
        window.dispatchEvent(new Event('hydration-updated'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setMessages(messages);
      setInput(trimmed);
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickReply(reply: CoachChatQuickReply) {
    if (loading) return;

    if (reply.action === 'review-meals') {
      await startMealReviewFlow(reply);
      return;
    }

    if (reply.action === 'show-meal') {
      showMealDetail(reply);
      return;
    }

    await send(reply.message);
  }

  const displayedQuickReplies = activeQuickReplies ?? quickReplies;
  const showQuickReplies =
    Boolean(displayedQuickReplies?.length) &&
    !loading &&
    !greetingLoading &&
    (messages.length === 0 || messages.at(-1)?.role === 'assistant');

  return (
    <div
      className={clsx(
        'flex min-h-0 flex-col overflow-hidden rounded-3xl border border-app-border bg-app-surface shadow-sm',
        className ?? 'h-[min(32.5rem,calc(90vh-6rem))] sm:h-[min(46rem,calc(90vh-6rem))]'
      )}
    >
      <div className="flex items-center gap-3 border-b border-app-border px-4 py-3">
        <img
          src={coach.image}
          alt={coach.name}
          className="h-9 w-9 rounded-full object-cover"
          style={{ objectPosition: '50% 18%' }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-app-text">{coach.name}</p>
          <p className="truncate text-xs text-app-text-muted">Ask anything between check-ins</p>
        </div>
        <button
          type="button"
          aria-label={`What ${coach.name} remembers`}
          aria-expanded={memoryOpen}
          onClick={() => setMemoryOpen((open) => !open)}
          className={`shrink-0 rounded-lg p-2 transition ${
            memoryOpen
              ? 'bg-brand-green/10 text-brand-green'
              : 'text-app-text-muted hover:bg-app-muted hover:text-brand-green'
          }`}
        >
          <Brain size={18} aria-hidden />
        </button>
      </div>

      {memoryOpen ? (
        <div className="border-b border-app-border bg-app-bg/40 px-4 py-3">
          <p className="text-sm font-semibold text-app-text">What {coach.name} remembers</p>
          <p className="mt-1 text-sm leading-relaxed text-app-text-muted">
            Personal details from your chats, check-ins, and texts — only you can see these. You can also ask
            &ldquo;show me your memory&rdquo; in chat.
          </p>
        </div>
      ) : null}

      <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto bg-app-bg/40 px-4 py-4">
        {messages.map((message, index) => (
          <div key={index} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'rounded-br-md bg-[#0b84fe] text-white'
                  : 'rounded-bl-md bg-app-muted text-app-text'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {loading || greetingLoading ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-app-muted px-4 py-3">
              <span className="h-2 w-2 animate-bounce rounded-full bg-app-text-muted [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-app-text-muted [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-app-text-muted" />
            </div>
          </div>
        ) : null}
      </div>

      {error && <p className="px-4 pt-2 text-xs text-red-600">{error}</p>}

      {showQuickReplies ? (
        <div className="flex flex-wrap gap-2 border-t border-app-border px-3 py-3">
          {displayedQuickReplies!.map((reply) => (
            <button
              key={reply.mealId ?? `${reply.label}-${reply.action ?? 'default'}`}
              type="button"
              onClick={() => void handleQuickReply(reply)}
              className="rounded-full border border-app-border bg-app-bg px-3 py-2 text-left text-sm font-medium text-app-text transition hover:border-brand-green/50 hover:bg-brand-green/10"
            >
              {reply.mobileLabel ? (
                <>
                  <span className="sm:hidden">{reply.mobileLabel}</span>
                  <span className="hidden sm:inline">{reply.label}</span>
                </>
              ) : (
                reply.label
              )}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="flex items-end gap-2 border-t border-app-border px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send(input);
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          className="min-w-0 flex-1 resize-none rounded-2xl border border-app-border bg-app-bg px-4 py-2.5 text-sm leading-5 text-app-text outline-none focus:border-brand-green/60"
          placeholder={`Message ${coach.name}…`}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
          disabled={loading || greetingLoading}
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={loading || greetingLoading || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0b84fe] text-white transition hover:bg-[#0b84fe]/90 disabled:opacity-40"
        >
          <SendHorizontal size={18} aria-hidden />
        </button>
      </form>
    </div>
  );
}
