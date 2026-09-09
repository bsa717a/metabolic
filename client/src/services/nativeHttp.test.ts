import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.fn();
let native = false;

vi.mock('@capacitor/core', () => ({
  CapacitorHttp: {
    request: (...args: unknown[]) => request(...args)
  }
}));

vi.mock('./nativeAuthPlatform', () => ({
  isNativeAuthPlatform: () => native
}));

describe('nativeAwareFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    native = false;
    fetchMock = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    global.fetch = fetchMock as typeof fetch;
  });

  it('uses window fetch on web', async () => {
    const { nativeAwareFetch } = await import('./nativeHttp');
    await nativeAwareFetch('https://api.example.com/me', {
      headers: { Authorization: 'Bearer t' }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });

  it('uses CapacitorHttp on native and returns a fetch Response', async () => {
    native = true;
    request.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: '{"id":"u1"}',
      url: 'https://api.example.com/me'
    });

    const { nativeAwareFetch } = await import('./nativeHttp');
    const response = await nativeAwareFetch('https://api.example.com/me', {
      headers: { Authorization: 'Bearer t' }
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/me',
        method: 'GET',
        headers: { Authorization: 'Bearer t' },
        responseType: 'text'
      })
    );
    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual({ id: 'u1' });
  });

  it('sends JSON bodies as parsed data on native', async () => {
    native = true;
    request.mockResolvedValue({
      status: 200,
      headers: {},
      data: '{}',
      url: 'https://api.example.com/sync'
    });

    const { nativeAwareFetch } = await import('./nativeHttp');
    await nativeAwareFetch('https://api.example.com/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' })
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        data: { hello: 'world' }
      })
    );
  });

  it('falls back to fetch for FormData bodies', async () => {
    native = true;
    const { nativeAwareFetch } = await import('./nativeHttp');
    const form = new FormData();
    form.append('file', new Blob(['x']), 'x.txt');
    await nativeAwareFetch('https://api.example.com/upload', {
      method: 'POST',
      body: form
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
  });
});
