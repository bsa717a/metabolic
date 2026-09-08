import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetIdToken = vi.fn();
const mockForceTokenRefresh = vi.fn();

vi.mock('./auth', () => ({
  getIdToken: () => mockGetIdToken(),
  forceTokenRefresh: () => mockForceTokenRefresh()
}));

vi.mock('./diagnostics', () => ({
  recordFailedRequest: vi.fn()
}));

describe('api', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches auth token to requests', async () => {
    mockGetIdToken.mockResolvedValue('test-token');

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"data": "test"}')
    });

    const { api } = await import('./api');
    await api('/test');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token'
        })
      })
    );
  });

  it('retries with fresh token on 401 response', async () => {
    const staleToken = 'stale-token';
    const freshToken = 'fresh-token';

    mockGetIdToken.mockResolvedValue(staleToken);
    mockForceTokenRefresh.mockResolvedValue(freshToken);

    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Unauthorized' })
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve('{"success": true}')
      });
    });

    const { api } = await import('./api');
    const result = await api('/test');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockForceTokenRefresh).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ success: true });

    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${freshToken}`
        })
      })
    );
  });

  it('does not retry if token refresh returns same token', async () => {
    const token = 'same-token';

    mockGetIdToken.mockResolvedValue(token);
    mockForceTokenRefresh.mockResolvedValue(token);

    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' })
    });

    const { api } = await import('./api');

    await expect(api('/test')).rejects.toThrow('Unauthorized');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockForceTokenRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not retry on non-401 errors', async () => {
    mockGetIdToken.mockResolvedValue('token');

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' })
    });

    const { api } = await import('./api');

    await expect(api('/test')).rejects.toThrow('Server error');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockForceTokenRefresh).not.toHaveBeenCalled();
  });

  it('does not retry when no token is present', async () => {
    mockGetIdToken.mockResolvedValue(null);

    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' })
    });

    const { api } = await import('./api');

    await expect(api('/test')).rejects.toThrow('Unauthorized');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockForceTokenRefresh).not.toHaveBeenCalled();
  });

  it('handles 204 No Content responses', async () => {
    mockGetIdToken.mockResolvedValue('token');

    fetchMock.mockResolvedValue({
      ok: true,
      status: 204
    });

    const { api } = await import('./api');
    const result = await api('/test', { method: 'DELETE' });

    expect(result).toBeUndefined();
  });
});

describe('apiBlob', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    fetchMock = vi.fn();
    global.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries with fresh token on 401 response', async () => {
    const staleToken = 'stale-token';
    const freshToken = 'fresh-token';

    mockGetIdToken.mockResolvedValue(staleToken);
    mockForceTokenRefresh.mockResolvedValue(freshToken);

    const mockBlob = new Blob(['test'], { type: 'application/octet-stream' });

    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Unauthorized' })
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob)
      });
    });

    const { apiBlob } = await import('./api');
    const result = await apiBlob('/test');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockForceTokenRefresh).toHaveBeenCalledTimes(1);
    expect(result).toBe(mockBlob);
  });
});
