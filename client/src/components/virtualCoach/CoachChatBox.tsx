import { useEffect, useRef, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import type { VirtualCoach } from '../../data/virtualCoaches';
import { api } from '../../services/api';

type Message = { role: 'user' | 'assistant'; content: string };

export function CoachChatBox({ coach }: { coach: VirtualCoach }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setError(undefined);
    setLoading(true);

    try {
      const result = await api<{ reply: string }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: nextMessages })
      });
      setMessages([...nextMessages, { role: 'assistant', content: result.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setMessages(messages);
      setInput(trimmed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[32.5rem] flex-col overflow-hidden rounded-3xl border border-app-border bg-app-surface shadow-sm">
      <div className="flex items-center gap-3 border-b border-app-border px-4 py-3">
        <img
          src={coach.image}
          alt={coach.name}
          className="h-9 w-9 rounded-full object-cover"
          style={{ objectPosition: '50% 18%' }}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-app-text">{coach.name}</p>
          <p className="truncate text-xs text-app-text-muted">Ask anything between check-ins</p>
        </div>
      </div>

      <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto bg-app-bg/40 px-4 py-4">
        {messages.length === 0 && (
          <p className="px-1 text-sm text-app-text-muted">
            Message {coach.name} about meals, eating out, your numbers, or getting back on track.
          </p>
        )}
        {messages.map((message, index) => (
          <div key={index} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'rounded-br-md bg-[#0b84fe] text-white'
                  : 'rounded-bl-md bg-app-muted text-app-text'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-app-muted px-4 py-3">
              <span className="h-2 w-2 animate-bounce rounded-full bg-app-text-muted [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-app-text-muted [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-app-text-muted" />
            </div>
          </div>
        )}
      </div>

      {error && <p className="px-4 pt-2 text-xs text-red-600">{error}</p>}

      <form
        className="flex items-center gap-2 border-t border-app-border px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-full border border-app-border bg-app-bg px-4 py-2.5 text-sm text-app-text outline-none focus:border-brand-green/60"
          placeholder={`Message ${coach.name}…`}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={loading || !input.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0b84fe] text-white transition hover:bg-[#0b84fe]/90 disabled:opacity-40"
        >
          <SendHorizontal size={18} aria-hidden />
        </button>
      </form>
    </div>
  );
}
