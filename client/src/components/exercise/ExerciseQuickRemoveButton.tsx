import { X } from 'lucide-react';

export function ExerciseQuickRemoveButton({
  name,
  onClick,
  disabled = false,
  size = 'md'
}: {
  name: string;
  onClick: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const sizeClass = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';

  return (
    <button
      type="button"
      aria-label={`Remove ${name}`}
      title={`Remove ${name}`}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`grid ${sizeClass} shrink-0 place-items-center rounded-xl text-red-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50`}
    >
      <X size={size === 'sm' ? 16 : 18} />
    </button>
  );
}
