import { useState } from 'react';
import { Upload } from 'lucide-react';
import { usePhotoPicker } from '../../hooks/usePhotoPicker';

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
  const [pickerError, setPickerError] = useState<string | null>(null);
  const { openPicker, fileInput } = usePhotoPicker({
    accept: 'image/*',
    disabled,
    onSelect: (file) => {
      setPickerError(null);
      onSelect(file);
    },
    onError: setPickerError
  });

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
          onClick={() => void openPicker()}
        >
          <Upload size={14} />
          {draft.previewUrl ? 'Replace' : 'Upload'}
        </button>
      </div>

      {fileInput}
      {pickerError ? <p className="mb-3 text-sm text-red-600">{pickerError}</p> : null}

      {draft.previewUrl ? (
        <img src={draft.previewUrl} alt={`${label} progress`} className={`${previewClassName} w-full rounded-xl object-cover`} />
      ) : (
        <button
          type="button"
          disabled={disabled}
          className={`flex ${previewClassName} w-full flex-col items-center justify-center rounded-xl border border-dashed border-app-border bg-app-muted/50 text-sm text-app-text-muted transition hover:border-brand-green/40 disabled:cursor-not-allowed disabled:opacity-50`}
          onClick={() => void openPicker()}
        >
          <Upload size={20} className="mb-2" />
          Choose photo
        </button>
      )}
    </div>
  );
}
