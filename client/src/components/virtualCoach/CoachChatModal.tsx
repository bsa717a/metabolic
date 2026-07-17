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
  chatSessionKey?: number;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-slate-950/35 p-0 sm:place-items-center sm:p-4"
      role="presentation"
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-app-border bg-app-surface shadow-2xl sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-label={`Message ${coach.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-end border-b border-app-border px-3 py-2">
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-app-text-muted transition hover:bg-app-muted hover:text-app-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 p-3 pt-0">
          <CoachChatBox
            key={`${coach.id}-${chatSessionKey}`}
            coach={coach}
            initialMessages={initialMessages}
            onUserMessage={onUserMessage}
            quickReplies={quickReplies}
            autoGreeting={autoGreeting}
            userFirstName={userFirstName}
            className="h-[min(32.5rem,calc(90vh-3.5rem))]"
          />
        </div>
      </div>
    </div>
  );
}
