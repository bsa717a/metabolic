import { useRef } from 'react';
import { Upload } from 'lucide-react';

export type PhotoDraft = {
  existingUrl: string | null;
  file: File | null;
  previewUrl: string | null;
};

export function emptyPhotoDraft(url: string | null = null): PhotoDraft {
  return { existingUrl: url, file: null, previewUrl: url };
}

export function ProgressPhotoUploadField({
  label,
  draft,
  disabled,
  onSelect,
  previewClassName = 'h-40'
}: {
  label: string;
  draft: PhotoDraft;
  disabled: boolean;
  onSelect: (file: File) => void;
  previewClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-2xl border border-app-border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-app-text">{label}</p>
          <p className="text-xs text-app-text-muted">JPG, PNG, or WEBP up to 10 MB</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-full border border-app-border px-3 py-1.5 text-sm font-medium transition hover:bg-app-muted disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={14} />
          {draft.previewUrl ? 'Replace' : 'Upload'}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onSelect(file);
          event.target.value = '';
        }}
      />

      {draft.previewUrl ? (
        <img src={draft.previewUrl} alt={`${label} progress`} className={`${previewClassName} w-full rounded-xl object-cover`} />
      ) : (
        <button
          type="button"
          disabled={disabled}
          className={`flex ${previewClassName} w-full flex-col items-center justify-center rounded-xl border border-dashed border-app-border bg-app-muted/50 text-sm text-app-text-muted transition hover:border-brand-green/40 disabled:cursor-not-allowed disabled:opacity-50`}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={20} className="mb-2" />
          Choose photo
        </button>
      )}
    </div>
  );
}
