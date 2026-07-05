import { clsx } from 'clsx';
import { COLOR_THEMES } from '../../theme/palettes';
import { useTheme } from '../../theme/ThemeContext';

type ColorThemePickerProps = {
  className?: string;
  compact?: boolean;
};

export function ColorThemePicker({ className, compact = false }: ColorThemePickerProps) {
  const { colorTheme, setColorTheme } = useTheme();

  return (
    <div className={className}>
      {!compact ? <p className="mb-2 text-xs font-medium text-app-text-muted">Theme</p> : null}
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Color theme">
        {COLOR_THEMES.map((palette) => {
          const selected = colorTheme === palette.id;
          return (
            <button
              key={palette.id}
              type="button"
              aria-label={`${palette.label} theme`}
              aria-pressed={selected}
              title={palette.label}
              onClick={() => setColorTheme(palette.id)}
              className={clsx(
                'flex flex-1 flex-col items-center gap-1 rounded-xl border p-2 transition',
                selected
                  ? 'border-brand-green ring-2 ring-brand-green/30'
                  : 'border-app-border hover:border-app-text-muted/40'
              )}
            >
              <span
                className="flex h-6 w-full overflow-hidden rounded-md border border-black/10"
                aria-hidden
              >
                <span className="flex-1" style={{ backgroundColor: palette.swatchBg }} />
                <span className="w-3" style={{ backgroundColor: palette.swatchAccent }} />
              </span>
              <span className="text-[10px] font-medium text-app-text-muted">{palette.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
