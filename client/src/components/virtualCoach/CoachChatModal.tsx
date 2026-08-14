import { X } from 'lucide-react';
import type { VirtualCoach } from '../../data/virtualCoaches';
import { CoachChatBox, type CoachChatMessage, type CoachChatQuickReply } from './CoachChatBox';

export function CoachChatModal({
  open,
  coach,
  initialMessages = [],
  onClose,
  onUserMessage,
  quickReplies,
  closeOnBackdropClick = true,
  autoGreeting = false,
  userFirstName,
  seedUserMessage,
  chatSessionKey = 0
}: {
  open: boolean;
  coach: VirtualCoach;
  initialMessages?: CoachChatMessage[];
  onClose: () => void;
  onUserMessage?: (text: string) => void;
  quickReplies?: CoachChatQuickReply[];
  closeOnBackdropClick?: boolean;
  autoGreeting?: boolean;
  userFirstName?: string | null;
  seedUserMessage?: string;
  chatSessionKey?: number;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/35 sm:grid sm:place-items-center sm:p-4"
      role="presentation"
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        className="fixed inset-x-0 bottom-0 top-[var(--app-topbar-height,0px)] flex w-full flex-col overflow-hidden rounded-t-3xl border border-app-border bg-app-surface shadow-2xl sm:static sm:max-h-[90vh] sm:max-w-lg sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Message ${coach.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-end border-b border-app-border px-3 py-2">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col p-3 pt-0">
          <CoachChatBox
            key={`${coach.id}-${chatSessionKey}`}
            coach={coach}
            initialMessages={initialMessages}
            onUserMessage={onUserMessage}
            quickReplies={quickReplies}
            autoGreeting={autoGreeting}
            userFirstName={userFirstName}
            seedUserMessage={seedUserMessage}
            className="h-full min-h-0 border-0 shadow-none sm:h-[min(46rem,calc(90vh-3.5rem))] sm:border sm:shadow-sm"
          />
        </div>
      </div>
    </div>
  );
}
