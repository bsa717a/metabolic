import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDiscovery, getChapter, getSkill, getPrimaryPack } from './index.js';

describe('guided journey curriculum registry', () => {
  it('loads Level 1 pack discoveries by id without UI coupling', () => {
    const pack = getPrimaryPack();
    assert.ok(pack.invite.ctaLabel);
    const discovery = getDiscovery('observe-hunger');
    assert.ok(discovery);
    assert.equal(discovery?.chapterId, 'chapter-becoming-aware');
    assert.ok(discovery?.sceneAssetIds.experiencing);
    assert.ok(discovery?.staticCoachResponse);
    const chapter = getChapter('chapter-becoming-aware');
    assert.equal(chapter?.levelId, 'level-1');
    const skill = getSkill('hunger-awareness');
    assert.equal(skill?.title, 'Hunger Awareness');
  });
});
