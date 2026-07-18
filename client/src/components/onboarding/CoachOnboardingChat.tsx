import { useEffect, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import type { VirtualCoach } from '../../data/virtualCoaches';
import type { SetupFormState } from '../../types/onboarding';
import {
  advanceCoachOnboarding,
  buildIntroTurn,
  type CoachOnboardingQuickReply,
  type CoachOnboardingStage,
  type CoachOnboardingTurn
} from './coachOnboardingFlow';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type CoachOnboardingChatProps = {
  coach: VirtualCoach;
  form: SetupFormState;
  firstName?: string | null;
  onFormPatch: (patch: Partial<SetupFormState>) => void;
  onSubmit: () => Promise<void>;
  submitting?: boolean;
  className?: string;
};

export function CoachOnboardingChat({
  coach,
  form,
  firstName,
  onFormPatch,
  onSubmit,
  submitting = false,
  className
}: CoachOnboardingChatProps) {
  const intro = buildIntroTurn(coach, firstName);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: intro.assistantMessage }
  ]);
  const [quickReplies, setQuickReplies] = useState<CoachOnboardingQuickReply[] | undefined>(
    intro.quickReplies
  );
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const formRef = useRef(form);
  const stageRef = useRef<CoachOnboardingStage>(intro.stage);
  const busyRef = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy, quickReplies?.length]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input]);

  function applyTurn(turn: CoachOnboardingTurn) {
    stageRef.current = turn.stage;
    setQuickReplies(turn.quickReplies);
    setMessages((current) => [...current, { role: 'assistant', content: turn.assistantMessage }]);
  }

  async function handleAdvance(raw: string, displayLabel?: string) {
    const trimmed = raw.trim();
    if (!trimmed || busyRef.current || submitting) return;

    busyRef.current = true;
    setBusy(true);
    setError('');
    setMessages((current) => [...current, { role: 'user', content: displayLabel ?? trimmed }]);
    setInput('');
    setQuickReplies(undefined);

    try {
      const result = advanceCoachOnboarding(stageRef.current, trimmed, formRef.current, coach);

      if (result.error) {
        setError(result.error);
        setQuickReplies(result.next.quickReplies);
        // Keep an assistant beat so quick replies stay visible after a bad answer.
        setMessages((current) => [
          ...current,
          { role: 'assistant', content: result.error ?? 'Please try again.' }
        ]);
        return;
      }

      if (result.formPatch) {
        formRef.current = { ...formRef.current, ...result.formPatch };
        onFormPatch(result.formPatch);
      }

      if (result.submit) {
        await onSubmit();
        return;
      }

      applyTurn(result.next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const showQuickReplies =
    Boolean(quickReplies?.length) && !busy && !submitting && messages.at(-1)?.role === 'assistant';

  return (
    <div
      className={clsx(
        'flex min-h-0 flex-col overflow-hidden rounded-3xl border border-app-border bg-app-surface shadow-sm',
        className ?? 'h-[min(48rem,calc(100vh-3.5rem))] sm:h-[min(56rem,calc(100vh-3.5rem))]'
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
          <p className="truncate text-xs text-app-text-muted">Setting up your plan together</p>
        </div>
      </div>

      <div ref={threadRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-app-bg/40 px-4 py-4">
        {messages.map((message, index) => (
          <div key={index} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'rounded-br-md bg-[#0b84fe] text-white'
                  : 'rounded-bl-md bg-app-muted text-app-text'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {busy || submitting ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-app-muted px-4 py-3">
              <span className="h-2 w-2 animate-bounce rounded-full bg-app-text-muted [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-app-text-muted [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-app-text-muted" />
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="px-4 pt-2 text-xs text-red-600">{error}</p> : null}

      {showQuickReplies ? (
        <div className="flex flex-wrap gap-2 border-t border-app-border px-3 py-3">
          {quickReplies!.map((reply) => (
            <button
              key={`${reply.label}-${reply.value}`}
              type="button"
              disabled={busy || submitting}
              onClick={() => void handleAdvance(reply.value, reply.label)}
              className="rounded-full border border-app-border bg-app-bg px-3 py-2 text-left text-sm font-medium text-app-text transition hover:border-brand-green/50 hover:bg-brand-green/10 disabled:opacity-40"
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
          void handleAdvance(input);
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          className="min-w-0 flex-1 resize-none rounded-2xl border border-app-border bg-app-bg px-4 py-2.5 text-sm leading-5 text-app-text outline-none focus:border-brand-green/60"
          placeholder={`Reply to ${coach.name}…`}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void handleAdvance(input);
            }
          }}
          disabled={busy || submitting}
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={busy || submitting || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0b84fe] text-white transition hover:bg-[#0b84fe]/90 disabled:opacity-40"
        >
          <SendHorizontal size={18} aria-hidden />
        </button>
      </form>
    </div>
  );
}
