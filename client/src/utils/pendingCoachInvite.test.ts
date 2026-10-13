import { describe, expect, it } from 'vitest';
import { postLoginPath } from './pendingCoachInvite';

describe('postLoginPath', () => {
  it('sends existing accounts back to the join page when an invite is pending', () => {
    expect(postLoginPath({ pendingCoachCode: 'DF', returnTo: '/nutrition' })).toBe('/join');
  });

  it('honors a same-origin return path when there is no pending invite', () => {
    expect(postLoginPath({ pendingCoachCode: null, returnTo: '/join' })).toBe('/join');
  });

  it('ignores off-site or protocol-relative return paths', () => {
    expect(postLoginPath({ returnTo: 'https://evil.example' })).toBe('/');
    expect(postLoginPath({ returnTo: '//evil.example' })).toBe('/');
    expect(postLoginPath({ returnTo: '' })).toBe('/');
  });
});
