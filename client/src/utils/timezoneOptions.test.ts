import { describe, expect, it } from 'vitest';
import { formatTimezoneLabel } from './timezoneOptions';

describe('formatTimezoneLabel', () => {
  it('turns an IANA id into a friendly name and keeps unknown ids readable', () => {
    expect(formatTimezoneLabel('America/Chicago')).toBe('Central Time (Chicago)');
    expect(formatTimezoneLabel('America/New_York')).toBe('Eastern Time (New York)');
    expect(formatTimezoneLabel('America/Los_Angeles')).toBe('Pacific Time (Los Angeles)');
    expect(formatTimezoneLabel('Pacific/Honolulu')).toBe('Hawaii-Aleutian Standard Time (Honolulu)');
    expect(formatTimezoneLabel('Europe/London')).toMatch(/\(London\)$/);
    expect(formatTimezoneLabel('not a zone')).toBe('not a zone');
  });
});
