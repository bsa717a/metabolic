import { useEffect, useRef, useState } from 'react';
import { Brain, SendHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import type { VirtualCoach } from '../../data/virtualCoaches';
import type { Dashboard, Meal } from '../../types';
import type { MealCardsPayload } from '../../utils/mealCards';
import { api, todayDateParam } from '../../services/api';
import { buildCoachChatOpeningMessage } from './coachChatGreeting';
import {
  formatMealDetailForChat,
  isMealOutOfBalance,
  isReviewMealsRequest,
  MEAL_EDIT_ACTIVE_PROMPT,
  MEAL_PICKER_PROMPT,
  mealEditModeQuickReplies,
  mealPickerQuickReplies,
  mealRebalanceQuickReplies,
  mealReviewQuickReplies,
  quickReplyDisplayLabel,
  type CoachWelcomeQuickReply,
  type MealEditSession
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
  const [reviewedMeal, setReviewedMeal] = useState<Meal | null>(null);
  const [mealEditSession, setMealEditSession] = useState<MealEditSession | null>(null);
  const mealEditSessionRef = useRef<MealEditSession | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    mealEditSessionRef.current = mealEditSession;
  }, [mealEditSession]);

  useEffect(() => {
    if (!autoGreeting || initialMessages.length > 0) return;

    let cancelled = false;
    setGreetingLoading(true);

    void (async () => {
      try {
        const dashboard = await api<Dashboard>(`/api/dashboard/today?${todayDateParam()}`);
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

  async function loadTodayDashboard() {
    return api<Dashboard>(`/api/dashboard/today?${todayDateParam()}`);
  }

  async function loadTodayMeals() {
    const dashboard = await loadTodayDashboard();
    return dashboard.meals ?? [];
  }

  async function resolveTargetCalories(meal: Meal, date: string) {
    try {
      const cards = await api<MealCardsPayload[]>(`/api/daily-logs/${date}/meal-cards`);
      const match = cards.find((card) => card.mealNumber === meal.mealNumber);
      if (match?.targetCalories) return match.targetCalories;
    } catch {
      // Meal cards may be unavailable; fall back below.
    }
    return Number(meal.plannedCalories) || undefined;
  }

  async function startMealReviewFlow(reply: CoachChatQuickReply) {
    const label = quickReplyDisplayLabel(reply);
    appendMessages([{ role: 'user', content: label }]);
    onUserMessage?.(label);
    setError(undefined);
    setLoading(true);
    setMealEditSession(null);
    setReviewedMeal(null);

    try {
      const meals = await loadTodayMeals();
      if (!meals.length) {
        appendMessages([
          {
            role: 'assistant',
            content:
              "You don't have any meals on today's plan yet. Head to the Nutrition page to build your day, then come back and we can walk through them."
          }
        ]);
        setActiveQuickReplies(null);
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

  function findMealFromReply(reply: CoachChatQuickReply, meals: Meal[]) {
    if (reply.mealId) {
      const byId = meals.find((entry) => entry.id === reply.mealId);
      if (byId) return byId;
    }
    return (
      meals.find((entry) => entry.name === reply.message) ??
      meals.find((entry) => entry.name.toLowerCase() === reply.message.toLowerCase())
    );
  }

  async function showMealDetail(reply: CoachChatQuickReply, options?: { announceSelection?: boolean }) {
    if (options?.announceSelection !== false) {
      appendMessages([{ role: 'user', content: reply.label }]);
      onUserMessage?.(reply.label);
    }

    setLoading(true);
    setError(undefined);
    try {
      const meals = pickerMeals.length ? pickerMeals : await loadTodayMeals();
      const meal = findMealFromReply(reply, meals);
      if (!meal) {
        appendMessages([
          {
            role: 'assistant',
            content: `I couldn't find ${reply.label} on today's plan. Pick one of the meals below.`
          }
        ]);
        setPickerMeals(meals);
        setActiveQuickReplies(mealPickerQuickReplies(meals));
        return;
      }

      setPickerMeals(meals);
      setReviewedMeal(meal);
      setMealEditSession(null);
      appendMessages([{ role: 'assistant', content: formatMealDetailForChat(meal) }]);
      setActiveQuickReplies(mealReviewQuickReplies(meal));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function enterMealEditMode(meal: Meal) {
    setLoading(true);
    setError(undefined);
    try {
      const dashboard = await loadTodayDashboard();
      const date =
        typeof dashboard.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dashboard.date)
          ? dashboard.date
          : new Date().toISOString().slice(0, 10);
      const targetCalories = await resolveTargetCalories(meal, date);
      const session: MealEditSession = {
        mealId: meal.id,
        mealName: meal.name,
        mealNumber: meal.mealNumber,
        date,
        targetCalories
      };
      setMealEditSession(session);
      setReviewedMeal(meal);
      appendMessages([{ role: 'assistant', content: MEAL_EDIT_ACTIVE_PROMPT }]);
      setActiveQuickReplies(mealEditModeQuickReplies(meal.id));
    } finally {
      setLoading(false);
    }
  }

  async function exitMealEditMode(options?: { showSummary?: boolean }) {
    const session = mealEditSessionRef.current;
    setMealEditSession(null);
    if (!session) {
      setActiveQuickReplies(null);
      return;
    }

    setLoading(true);
    try {
      const meals = await loadTodayMeals();
      const meal = meals.find((entry) => entry.id === session.mealId) ?? reviewedMeal;
      setPickerMeals(meals);
      if (meal && options?.showSummary !== false) {
        setReviewedMeal(meal);
        appendMessages([
          {
            role: 'assistant',
            content: `Sounds good — here's ${meal.name} as it stands:\n\n${formatMealDetailForChat(meal, { includeEditHint: false })}\n\nWant to review another meal?`
          }
        ]);
        setActiveQuickReplies([
          ...mealPickerQuickReplies(meals),
          { label: 'Done reviewing', mobileLabel: 'Done', message: 'Done reviewing meals', action: 'done-meal-edit' }
        ]);
      } else {
        setActiveQuickReplies(mealPickerQuickReplies(meals));
        appendMessages([{ role: 'assistant', content: MEAL_PICKER_PROMPT }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setActiveQuickReplies(null);
    } finally {
      setLoading(false);
    }
  }

  async function refreshMealAfterEdit(options?: { checkBalance?: boolean }) {
    const session = mealEditSessionRef.current;
    if (!session) return;

    try {
      const meals = await loadTodayMeals();
      const meal = meals.find((entry) => entry.id === session.mealId);
      if (!meal) {
        setActiveQuickReplies(mealEditModeQuickReplies(session.mealId));
        return;
      }

      setReviewedMeal(meal);
      setPickerMeals(meals);

      // AI reply already asks about rebalance; only attach Yes/No buttons here.
      if (
        options?.checkBalance &&
        session.targetCalories &&
        isMealOutOfBalance(Number(meal.plannedCalories), session.targetCalories)
      ) {
        setActiveQuickReplies(mealRebalanceQuickReplies(meal.id));
        return;
      }

      setActiveQuickReplies(mealEditModeQuickReplies(meal.id));
    } catch {
      setActiveQuickReplies(mealEditModeQuickReplies(session.mealId));
    }
  }

  async function send(text: string, options?: { mealEditFocus?: MealEditSession | null }) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    if (!mealEditSessionRef.current && isReviewMealsRequest(trimmed)) {
      await startMealReviewFlow({
        label: 'Review meals',
        message: trimmed,
        action: 'review-meals'
      });
      return;
    }

    const focus = options?.mealEditFocus === undefined ? mealEditSessionRef.current : options.mealEditFocus;
    const priorMessages = messages;
    const nextMessages: CoachChatMessage[] = [...priorMessages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setError(undefined);
    setLoading(true);
    onUserMessage?.(trimmed);

    try {
      const result = await api<{ reply: string; hydrationGoalUpdated?: boolean; plannedMealsUpdated?: boolean }>(
        '/api/ai/chat',
        {
          method: 'POST',
          body: JSON.stringify({
            messages: nextMessages,
            ...(focus
              ? {
                  mealEditFocus: {
                    mealName: focus.mealName,
                    mealId: focus.mealId,
                    date: focus.date,
                    targetCalories: focus.targetCalories
                  }
                }
              : {})
          })
        }
      );
      setMessages([...nextMessages, { role: 'assistant', content: result.reply }]);
      if (result.hydrationGoalUpdated) {
        window.dispatchEvent(new Event('hydration-updated'));
      }
      if (focus) {
        await refreshMealAfterEdit({ checkBalance: Boolean(result.plannedMealsUpdated) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setMessages(priorMessages);
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
      await showMealDetail(reply);
      return;
    }

    if (reply.action === 'pick-another-meal') {
      appendMessages([{ role: 'user', content: quickReplyDisplayLabel(reply) }]);
      onUserMessage?.(quickReplyDisplayLabel(reply));
      setMealEditSession(null);
      setReviewedMeal(null);
      setLoading(true);
      try {
        const meals = await loadTodayMeals();
        setPickerMeals(meals);
        setActiveQuickReplies(mealPickerQuickReplies(meals));
        appendMessages([{ role: 'assistant', content: MEAL_PICKER_PROMPT }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (reply.action === 'edit-meal') {
      appendMessages([{ role: 'user', content: quickReplyDisplayLabel(reply) }]);
      onUserMessage?.(quickReplyDisplayLabel(reply));
      const meal = reply.mealId
        ? pickerMeals.find((entry) => entry.id === reply.mealId) ??
          (reviewedMeal?.id === reply.mealId ? reviewedMeal : undefined)
        : reviewedMeal ?? undefined;
      if (!meal) {
        appendMessages([
          { role: 'assistant', content: "I lost track of that meal — pick one again and we'll edit it." }
        ]);
        setLoading(true);
        try {
          const meals = await loadTodayMeals();
          setPickerMeals(meals);
          setActiveQuickReplies(mealPickerQuickReplies(meals));
        } finally {
          setLoading(false);
        }
        return;
      }
      await enterMealEditMode(meal);
      return;
    }

    if (reply.action === 'skip-meal-edit') {
      appendMessages([{ role: 'user', content: quickReplyDisplayLabel(reply) }]);
      onUserMessage?.(quickReplyDisplayLabel(reply));
      setMealEditSession(null);
      if (pickerMeals.length) {
        appendMessages([
          {
            role: 'assistant',
            content: 'Great. Want to review another meal, or are we good for now?'
          }
        ]);
        setActiveQuickReplies([
          ...mealPickerQuickReplies(pickerMeals),
          { label: 'All set', mobileLabel: 'Done', message: 'All set', action: 'done-meal-edit' }
        ]);
      } else {
        setActiveQuickReplies(null);
        appendMessages([{ role: 'assistant', content: 'Sounds good — we can come back to meals anytime.' }]);
      }
      return;
    }

    if (reply.action === 'done-meal-edit') {
      appendMessages([{ role: 'user', content: quickReplyDisplayLabel(reply) }]);
      onUserMessage?.(quickReplyDisplayLabel(reply));
      if (mealEditSessionRef.current) {
        await exitMealEditMode({ showSummary: true });
      } else {
        setActiveQuickReplies(null);
        appendMessages([{ role: 'assistant', content: 'Sounds good — we can come back to meals anytime.' }]);
      }
      return;
    }

    if (reply.action === 'show-meal-again') {
      appendMessages([{ role: 'user', content: quickReplyDisplayLabel(reply) }]);
      onUserMessage?.(quickReplyDisplayLabel(reply));
      const session = mealEditSessionRef.current;
      setLoading(true);
      try {
        const meals = await loadTodayMeals();
        const meal =
          (session && meals.find((entry) => entry.id === session.mealId)) ||
          (reply.mealId && meals.find((entry) => entry.id === reply.mealId)) ||
          reviewedMeal;
        if (!meal) {
          appendMessages([{ role: 'assistant', content: "I couldn't reload that meal. Pick one below." }]);
          setPickerMeals(meals);
          setActiveQuickReplies(mealPickerQuickReplies(meals));
          return;
        }
        setReviewedMeal(meal);
        appendMessages([
          { role: 'assistant', content: formatMealDetailForChat(meal, { includeEditHint: false }) }
        ]);
        setActiveQuickReplies(
          session ? mealEditModeQuickReplies(session.mealId) : mealReviewQuickReplies(meal)
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (reply.action === 'dismiss-rebalance') {
      appendMessages([{ role: 'user', content: quickReplyDisplayLabel(reply) }]);
      onUserMessage?.(quickReplyDisplayLabel(reply));
      const session = mealEditSessionRef.current;
      appendMessages([
        {
          role: 'assistant',
          content: session
            ? `No problem — we can keep editing ${session.mealName}, or tap Done when you're ready.`
            : 'No problem.'
        }
      ]);
      if (session) setActiveQuickReplies(mealEditModeQuickReplies(session.mealId));
      else setActiveQuickReplies(null);
      return;
    }

    if (reply.action === 'rebalance-meal') {
      await send(reply.message, { mealEditFocus: mealEditSessionRef.current });
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
          <p className="truncate text-xs text-app-text-muted">
            {mealEditSession ? `Editing ${mealEditSession.mealName}` : 'Ask anything between check-ins'}
          </p>
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
          placeholder={
            mealEditSession ? `Change ${mealEditSession.mealName}…` : `Message ${coach.name}…`
          }
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
