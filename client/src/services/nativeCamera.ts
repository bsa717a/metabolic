import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isNativeAuthPlatform } from './nativeAuthPlatform';

export function isNativeCameraPlatform() {
  return isNativeAuthPlatform();
}

export function dataUrlToFile(dataUrl: string, filename: string): File {
  const comma = dataUrl.indexOf(',');
  const header = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error && 'code' in error) {
    return String((error as { code?: unknown }).code ?? '');
  }
  return '';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '');
  }
  return String(error ?? '');
}

export function isCameraPickCancelled(error: unknown): boolean {
  const code = errorCode(error);
  if (
    code === 'OS-PLUG-CAMR-0006' ||
    code === 'OS-PLUG-CAMR-0013' ||
    code === 'OS-PLUG-CAMR-0020'
  ) {
    return true;
  }
  return /cancel/i.test(errorMessage(error));
}

export function toCameraErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === 'OS-PLUG-CAMR-0003') {
    return 'Camera access is needed for meal and progress photos. Enable Camera in iPhone Settings.';
  }
  if (code === 'OS-PLUG-CAMR-0005') {
    return 'Photo library access is needed to choose an existing photo. Enable Photos in iPhone Settings.';
  }
  if (isCameraPickCancelled(error)) {
    return '';
  }
  const message = errorMessage(error);
  return message || 'Unable to use the camera.';
}

/**
 * Native iOS/Android photo capture via the Capacitor Camera plugin.
 * Uses getPhoto + DataUrl so we get a File without reading capacitor://
 * paths through CapacitorHttp (which intercepts window.fetch).
 */
export async function pickNativePhoto(): Promise<File | null> {
  const photo = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Prompt,
    saveToGallery: false,
    correctOrientation: true,
    width: 2048,
    promptLabelHeader: 'Add a photo',
    promptLabelPhoto: 'Photo library',
    promptLabelPicture: 'Take photo',
    promptLabelCancel: 'Cancel'
  });

  if (!photo.dataUrl) {
    throw new Error('Camera did not return an image.');
  }

  const format = (photo.format || 'jpeg').toLowerCase();
  const extension = format === 'jpeg' ? 'jpg' : format;
  return dataUrlToFile(photo.dataUrl, `photo.${extension}`);
}
