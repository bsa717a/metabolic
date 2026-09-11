import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPhoto = vi.fn();
let native = false;

vi.mock('@capacitor/camera', () => ({
  Camera: {
    getPhoto: (...args: unknown[]) => getPhoto(...args)
  },
  CameraResultType: { DataUrl: 'dataUrl' },
  CameraSource: { Prompt: 'PROMPT' }
}));

vi.mock('./nativeAuthPlatform', () => ({
  isNativeAuthPlatform: () => native
}));

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('nativeCamera', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    native = false;
  });

  it('converts a data URL into a File with the image MIME type', async () => {
    const { dataUrlToFile } = await import('./nativeCamera');
    const file = dataUrlToFile(PNG_DATA_URL, 'photo.png');
    expect(file.name).toBe('photo.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBeGreaterThan(0);
  });

  it('treats user-cancelled camera codes as cancellation', async () => {
    const { isCameraPickCancelled } = await import('./nativeCamera');
    expect(isCameraPickCancelled({ code: 'OS-PLUG-CAMR-0006', message: 'cancelled' })).toBe(true);
    expect(isCameraPickCancelled({ code: 'OS-PLUG-CAMR-0020' })).toBe(true);
    expect(isCameraPickCancelled(new Error('User cancelled photos app'))).toBe(true);
    expect(isCameraPickCancelled({ code: 'OS-PLUG-CAMR-0003', message: 'denied' })).toBe(false);
  });

  it('maps permission denials to Settings guidance', async () => {
    const { toCameraErrorMessage } = await import('./nativeCamera');
    expect(toCameraErrorMessage({ code: 'OS-PLUG-CAMR-0003' })).toMatch(/Enable Camera/);
    expect(toCameraErrorMessage({ code: 'OS-PLUG-CAMR-0005' })).toMatch(/Enable Photos/);
  });

  it('is only native when the Capacitor platform is native', async () => {
    native = true;
    const { isNativeCameraPlatform } = await import('./nativeCamera');
    expect(isNativeCameraPlatform()).toBe(true);
  });

  it('uses Capacitor Camera.getPhoto on native and returns a File', async () => {
    native = true;
    getPhoto.mockResolvedValue({ dataUrl: PNG_DATA_URL, format: 'png' });
    const { pickNativePhoto } = await import('./nativeCamera');

    const file = await pickNativePhoto();

    expect(getPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        resultType: 'dataUrl',
        source: 'PROMPT',
        saveToGallery: false
      })
    );
    expect(file?.type).toBe('image/png');
    expect(file?.name).toBe('photo.png');
  });

  it('throws when the plugin returns no image data', async () => {
    getPhoto.mockResolvedValue({ format: 'jpeg' });
    const { pickNativePhoto } = await import('./nativeCamera');
    await expect(pickNativePhoto()).rejects.toThrow('Camera did not return an image.');
  });
});
