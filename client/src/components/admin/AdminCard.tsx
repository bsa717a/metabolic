import { clsx } from 'clsx';
import { Card } from '../ui/Card';

type Props = {
  title: string;
  description: string;
  selected?: boolean;
  onClick?: () => void;
};

export function AdminCard({ title, description, selected, onClick }: Props) {
  return (
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={clsx(
        onClick && 'cursor-pointer transition hover:border-app-border hover:bg-app-muted',
        selected && 'border-brand-green ring-1 ring-brand-green'
      )}
    >
      <h3 className="text-lg font-bold text-app-text">{title}</h3>
      <p className="mt-2 text-sm text-app-text-muted">{description}</p>
    </Card>
  );
}
