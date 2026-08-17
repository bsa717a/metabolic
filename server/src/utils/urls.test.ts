import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { joinClientUrl } from './urls.js';

describe('joinClientUrl', () => {
  it('joins a site origin with a path', () => {
    assert.equal(joinClientUrl('https://metabolic-v1.web.app', '/nutrition'), 'https://metabolic-v1.web.app/nutrition');
    assert.equal(joinClientUrl('https://metabolic-v1.web.app/', 'nutrition'), 'https://metabolic-v1.web.app/nutrition');
  });

  it('keeps absolute http(s) URLs', () => {
    assert.equal(joinClientUrl('https://metabolic-v1.web.app', 'https://example.com/app'), 'https://example.com/app');
  });
});
