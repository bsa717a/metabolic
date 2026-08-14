import { useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AppUser, Meal } from '../../../types';
import { getVirtualCoach } from '../../../data/virtualCoaches';
import { pickCoachHomeGreeting } from '../../../utils/dashboardCopy';
import { buildCoachHomeBubble } from '../../virtualCoach/coachChatGreeting';
import { CoachChatModal } from '../../virtualCoach/CoachChatModal';
import { COACH_CHAT_QUICK_REPLIES } from '../../virtualCoach/coachWelcomeMessage';

const TAGLINE = 'Your metabolism. Your energy. Your results.';

export function CoachHomeHero({
  user,
  meals
}: {
  user?: AppUser | null;
  meals: Meal[];
}) {
  const navigate = useNavigate();
  const coach = getVirtualCoach(user?.selectedVirtualCoachId);
  const { greeting, name } = pickCoachHomeGreeting(user?.firstName);
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<string | undefined>();
  const [sessionKey, setSessionKey] = useState(0);
  const accent = coach?.accent ?? 'var(--brand-green)';
  const bubble = buildCoachHomeBubble(user?.firstName, meals);

  function openChat(text?: string) {
    if (!coach) {
      navigate('/virtual-coach/choose');
      return;
    }
    setSeed(text?.trim() || undefined);
    setSessionKey((key) => key + 1);
    setOpen(true);
    setDraft('');
  }

  return (
    <section className="relative overflow-hidden rounded-3xl bg-app-muted min-h-[22rem] sm:min-h-[24rem]">
      {coach ? (
        <img
          src={coach.heroImage}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-[75%_18%]"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/55" />

      <div className="relative flex min-h-[22rem] flex-col p-4 pb-2.5 sm:min-h-[24rem] sm:p-5 sm:pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {greeting},{' '}
            <span style={{ color: accent }}>{name}.</span>
          </h1>
          <p className="mt-1 text-xs text-white/85 sm:text-sm">{TAGLINE}</p>
          <span className="mt-2 block h-0.5 w-10 rounded-full bg-brand-gold" aria-hidden />
        </div>

        <div className="mt-auto flex flex-col gap-2">
          {coach ? (
            <div className="max-w-[17rem] rounded-2xl bg-white/45 px-3 py-2 text-sm text-brand-navy shadow-sm backdrop-blur-md dark:bg-app-surface/45 dark:text-app-text">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-app-text-muted">
                {coach.name} | Your AI Coach
              </p>
              <p className="mt-1 leading-snug">
                {bubble}{' '}
                <span className="font-semibold" style={{ color: accent }}>
                  You&apos;ve got this.
                </span>
              </p>
            </div>
          ) : (
            <p className="max-w-xs text-sm text-white/90">Choose a virtual coach to get daily guidance here.</p>
          )}

          <form
            className="flex items-center gap-2 rounded-full bg-white/45 px-3 py-1.5 shadow-md backdrop-blur-md dark:bg-app-surface/45"
            onSubmit={(event) => {
              event.preventDefault();
              openChat(draft);
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={coach ? `Ask ${coach.name} anything...` : 'Choose a coach to chat'}
              className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-app-text outline-none placeholder:text-app-text-muted"
            />
            <button
              type="submit"
              aria-label={coach ? `Send to ${coach.name}` : 'Choose a coach'}
              className="grid size-9 shrink-0 place-items-center rounded-full text-white"
              style={{ backgroundColor: accent }}
            >
              <ArrowUp size={18} aria-hidden />
            </button>
          </form>
        </div>
      </div>

      {coach ? (
        <CoachChatModal
          open={open}
          coach={coach}
          autoGreeting
          userFirstName={user?.firstName}
          seedUserMessage={seed}
          chatSessionKey={sessionKey}
          quickReplies={[...COACH_CHAT_QUICK_REPLIES]}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}
