import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

type RestartOnboardingConfirmModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function RestartOnboardingConfirmModal({
  open,
  onClose,
  onConfirm
}: RestartOnboardingConfirmModalProps) {
  return (
    <Modal open={open} title="Restart onboarding" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-app-text">
          This walks you through the guided coach setup again. Your current program, daily logs, and
          metrics stay exactly as they are.
        </p>
        <p className="text-sm text-app-text-muted">
          You can update goals, body composition, and preferences along the way — nothing gets
          deleted.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Start walkthrough</Button>
        </div>
      </div>
    </Modal>
  );
}
