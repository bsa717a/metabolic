import { useCallback, useRef } from 'react';
import {
  isCameraPickCancelled,
  isNativeCameraPlatform,
  pickNativePhoto,
  toCameraErrorMessage
} from '../services/nativeCamera';

export function usePhotoPicker({
  accept = 'image/jpeg,image/png,image/webp',
  disabled = false,
  onSelect,
  onError
}: {
  accept?: string;
  disabled?: boolean;
  onSelect: (file: File) => void;
  onError?: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = useCallback(async () => {
    if (disabled) return;
    if (isNativeCameraPlatform()) {
      try {
        const file = await pickNativePhoto();
        if (file) onSelect(file);
      } catch (error) {
        if (isCameraPickCancelled(error)) return;
        onError?.(toCameraErrorMessage(error));
      }
      return;
    }
    inputRef.current?.click();
  }, [disabled, onError, onSelect]);

  const fileInput = isNativeCameraPlatform() ? null : (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      className="hidden"
      disabled={disabled}
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) onSelect(file);
        event.target.value = '';
      }}
    />
  );

  return { openPicker, fileInput };
}
