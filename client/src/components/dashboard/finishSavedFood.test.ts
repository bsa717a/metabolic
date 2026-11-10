import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../services/api';
import { finishSavedFood } from './finishSavedFood';

vi.mock('../../services/api', () => ({ api: vi.fn() }));
const request = vi.mocked(api);

beforeEach(() => vi.resetAllMocks());

describe('finishSavedFood', () => {
  it('propagates a planned meal before refreshing', async () => {
    request.mockResolvedValue({});
    const refresh = vi.fn(async () => {
      expect(request).toHaveBeenCalledWith('/api/meals/meal-1/apply-forward', { method: 'POST' });
    });
    expect(await finishSavedFood('meal-1', 'apply-forward', refresh)).toBeNull();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('retries propagation without creating another food item', async () => {
    request.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({});
    const refresh = vi.fn();
    const failure = await finishSavedFood('meal-1', 'apply-forward', refresh);
    expect(failure?.step).toBe('apply-forward');
    expect(refresh).not.toHaveBeenCalled();
    expect(await finishSavedFood('meal-1', failure!.step, refresh)).toBeNull();
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      '/api/meals/meal-1/apply-forward', '/api/meals/meal-1/apply-forward'
    ]);
  });

  it('retries only the refresh after propagation succeeds', async () => {
    request.mockResolvedValue({});
    const refresh = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(undefined);
    const failure = await finishSavedFood('meal-1', 'apply-forward', refresh);
    expect(failure?.step).toBe('refresh');
    expect(failure?.message).toContain('Food saved');
    expect(await finishSavedFood('meal-1', failure!.step, refresh)).toBeNull();
    expect(request).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not propagate food logged as eaten', async () => {
    const refresh = vi.fn();
    expect(await finishSavedFood('meal-1', 'refresh', refresh)).toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
