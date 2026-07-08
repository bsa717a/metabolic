import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isShowMemoryRequest,
  mergeExtractedMemory,
  type MemoryFact,
  type MemorySessionSummary
} from './virtualCoachMemoryService.js';

describe('isShowMemoryRequest', () => {
  it('detects common show-memory phrases', () => {
    assert.equal(isShowMemoryRequest('show me your memory'), true);
    assert.equal(isShowMemoryRequest('What do you remember about me?'), true);
    assert.equal(isShowMemoryRequest('how are my macros today'), false);
  });
});

describe('mergeExtractedMemory', () => {
  const baseFact: MemoryFact = {
    id: '1',
    text: 'Recovering from knee surgery',
    source: 'web_chat',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };

  it('adds new facts without duplicates', () => {
    const merged = mergeExtractedMemory(
      [baseFact],
      [],
      { newFacts: ['Recovering from knee surgery', 'Travels for work'], removeFactTexts: [], sessionSummary: 'Talked about recovery.' },
      'web_chat'
    );
    assert.equal(merged.facts.length, 2);
    assert.equal(merged.sessionSummaries.length, 1);
  });

  it('removes facts by similar text', () => {
    const merged = mergeExtractedMemory(
      [baseFact],
      [],
      { newFacts: [], removeFactTexts: ['knee surgery'], sessionSummary: null },
      'web_chat'
    );
    assert.equal(merged.facts.length, 0);
  });

  it('keeps only the three most recent summaries', () => {
    const existing: MemorySessionSummary[] = [
      { id: 'a', source: 'sms', summary: 'One', at: '2026-01-01T00:00:00.000Z' },
      { id: 'b', source: 'sms', summary: 'Two', at: '2026-01-02T00:00:00.000Z' },
      { id: 'c', source: 'sms', summary: 'Three', at: '2026-01-03T00:00:00.000Z' }
    ];
    const merged = mergeExtractedMemory([], existing, {
      newFacts: [],
      removeFactTexts: [],
      sessionSummary: 'Four'
    }, 'check_in');
    assert.equal(merged.sessionSummaries.length, 3);
    assert.equal(merged.sessionSummaries[0]?.summary, 'Four');
  });
});
