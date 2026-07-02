import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECK_IN_STAGES,
  KICKOFF_STAGES,
  nextStage,
  parseTranscript,
  stagesForKind
} from './virtualCoachCheckInService.js';
import { MockAiProvider, type CoachCheckInStage, type CoachCheckInTurnResult } from './aiService.js';

describe('kickoff stage machinery', () => {
  it('selects the stage list by kind', () => {
    assert.deepEqual(stagesForKind('WEEKLY'), CHECK_IN_STAGES);
    assert.deepEqual(stagesForKind('KICKOFF'), KICKOFF_STAGES);
    assert.equal(KICKOFF_STAGES[0], 'welcome');
  });

  it('advances within the right flow and clamps at recap', () => {
    assert.equal(nextStage('opening'), 'wins');
    assert.equal(nextStage('welcome', 'KICKOFF'), 'why');
    assert.equal(nextStage('first_focus', 'KICKOFF'), 'commitment');
    assert.equal(nextStage('recap'), 'recap');
    assert.equal(nextStage('recap', 'KICKOFF'), 'recap');
  });

  it('parses transcripts against the flow, falling back to the first stage', () => {
    assert.equal(parseTranscript({ currentStage: 'wins', messages: [] }).currentStage, 'wins');
    // a weekly stage is invalid inside a kickoff transcript
    assert.equal(parseTranscript({ currentStage: 'wins', messages: [] }, 'KICKOFF').currentStage, 'welcome');
    assert.equal(parseTranscript({ currentStage: 'why', messages: [] }, 'KICKOFF').currentStage, 'why');
    assert.equal(parseTranscript(null).currentStage, 'opening');
  });

  it('preserves the kickoff why answer through parsing', () => {
    const parsed = parseTranscript({ currentStage: 'goals', messages: [], whyAnswer: 'For my kids.' }, 'KICKOFF');
    assert.equal(parsed.whyAnswer, 'For my kids.');
  });
});

describe('mock provider kickoff walk', () => {
  const provider = new MockAiProvider();

  const baseInput = {
    coachId: 'tess',
    flow: 'kickoff' as const,
    systemPrompt: 'test',
    weeklyReview: {
      weekStart: '2026-06-29',
      weekEnd: '2026-07-05',
      adherencePct: null,
      highlights: [],
      topMissedMeals: [],
      offPlanFoods: [],
      weakestDay: null,
      strongestDay: null,
      proteinGapGrams: null,
      weightTrend: []
    },
    kickoffContext: { goalLines: ['Weight: 210 → goal 185 lbs'] },
    transcript: [],
    userFirstName: 'Sam'
  };

  it('walks welcome → recap, ending done with a motivation-bearing recap', async () => {
    let stage: CoachCheckInStage = 'welcome';
    let last: CoachCheckInTurnResult | null = null;
    // opening coach line (no user message), then user replies through the flow
    last = await provider.coachCheckInTurn({ ...baseInput, stage });
    assert.equal(last.done, false);
    for (let i = 0; i < KICKOFF_STAGES.length; i += 1) {
      last = await provider.coachCheckInTurn({ ...baseInput, stage, userMessage: 'Sounds good.' });
      if (last.done) break;
      if (last.advance && stage !== 'recap') stage = nextStage(stage, 'KICKOFF');
    }
    assert.equal(last?.done, true);
    assert.ok(last?.recap, 'recap present at done');
    assert.ok(last?.recap?.motivation, 'kickoff recap includes motivation');
    assert.ok(last?.recap?.win && last.recap.pattern && last.recap.focus && last.recap.supportAction);
  });

  it('weekly flow still ends with a standard recap (no motivation required)', async () => {
    const result = await provider.coachCheckInTurn({
      ...baseInput,
      flow: 'weekly',
      kickoffContext: undefined,
      stage: 'recap',
      userMessage: 'Protein at lunch.'
    });
    assert.equal(result.done, true);
    assert.ok(result.recap);
  });
});
