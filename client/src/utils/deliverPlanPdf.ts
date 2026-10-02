import { isNativeIos } from './nativePlatform';

export type PlanPdfDelivery = 'share' | 'download';

/**
 * Capacitor Share and Filesystem are not installed, and this app cannot take a
 * new native iOS build while 1.0 (8) is in review. On the iOS shell, hand the
 * PDF to the system share sheet when the WebView can share files. Otherwise
 * download it.
 */
export function planPdfDeliveryKind(input: { nativeIos: boolean; canShareFiles: boolean }): PlanPdfDelivery {
  return input.nativeIos && input.canShareFiles ? 'share' : 'download';
}

export async function deliverPlanPdf(bytes: Uint8Array, filename: string): Promise<PlanPdfDelivery> {
  const blob = new Blob([toArrayBuffer(bytes)], { type: 'application/pdf' });
  const file = new File([blob], filename, { type: 'application/pdf' });
  const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const kind = planPdfDeliveryKind({ nativeIos: isNativeIos(), canShareFiles });

  if (kind === 'share') {
    await navigator.share({ files: [file], title: filename });
    return 'share';
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'download';
}

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
