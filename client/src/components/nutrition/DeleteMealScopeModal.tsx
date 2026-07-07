import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export function DeleteMealScopeModal({
  open,
  mealName,
  saving = false,
  onClose,
  onConfirm
}: {
  open: boolean;
  mealName: string;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (scope: 'today' | 'forward') => void | Promise<void>;
}) {
  return (
    <Modal open={open} title="Delete meal" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-app-text">
          Clear all planned foods from <span className="font-semibold">{mealName}</span>? Logged intake is kept.
        </p>
        <p className="text-sm font-medium text-app-text">Is this for today or going forward?</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={saving} onClick={() => void onConfirm('today')}>
            Today only
          </Button>
          <Button disabled={saving} onClick={() => void onConfirm('forward')}>
            {saving ? 'Deleting…' : 'Going forward'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
