import { useState } from 'react';
import { api } from '../services/api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

import { FeatureGate } from '../components/entitlements/FeatureGate';
import { EntitlementError } from '../services/api';

const prompts = [
  'What meal is next?',
  'Where do I stand with calories?',
  'What exercises are left?',
  "Build tomorrow's meals",
  'What should I eat to hit protein?',
  'Summarize my week'
];

type Message = { role: 'user' | 'assistant'; content: string };

export function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

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
      if (err instanceof EntitlementError) {
        setError(undefined);
        setMessages(messages);
        setInput(trimmed);
        return;
      }
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setMessages(messages);
      setInput(trimmed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">AI Assistant</h1>
      <FeatureGate feature="extended_ai_coach">
      <Card className="flex min-h-[32rem] flex-col">
        <p className="text-slate-500">
          Powered by Gemini on the backend. Your program, meals, and exercise data are included as context.
        </p>

        <div className="mt-5 flex-1 space-y-3 overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-sm text-slate-400">Ask a question or pick a starter prompt below.</p>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                message.role === 'user' ? 'ml-auto bg-slate-950 text-white' : 'bg-slate-50 text-slate-800'
              }`}
            >
              {message.content}
            </div>
          ))}
          {loading && <p className="text-sm text-slate-400">Thinking…</p>}
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={loading}
              className="rounded-2xl border border-slate-200 p-4 text-left font-semibold hover:bg-slate-50 disabled:opacity-50"
              onClick={() => send(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>

        <form
          className="mt-5 flex gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            send(input);
          }}
        >
          <input
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            placeholder="Ask about your program, meals, or progress…"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            Send
          </Button>
        </form>
      </Card>
      </FeatureGate>
    </div>
  );
}
