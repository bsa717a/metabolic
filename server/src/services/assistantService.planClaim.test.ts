import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  claimsCompletion,
  claimsHydrationGoalSet,
  claimsMealPlanUpdate,
  parseMealOptionPick,
  userRequestedMealAction
} from './assistantService.js';

describe('parseMealOptionPick', () => {
  it('parses bare and labeled option numbers', () => {
    assert.equal(parseMealOptionPick('2'), 2);
    assert.equal(parseMealOptionPick('option 1'), 1);
    assert.equal(parseMealOptionPick('#3'), 3);
    assert.equal(parseMealOptionPick('2.'), 2);
  });

  it('rejects non-picks', () => {
    assert.equal(parseMealOptionPick('20'), null);
    assert.equal(parseMealOptionPick('add 2 eggs'), null);
    assert.equal(parseMealOptionPick('Change the time to 10am'), null);
  });
});

describe('claimsMealPlanUpdate', () => {
  it('detects false-positive update claims', () => {
    assert.equal(
      claimsMealPlanUpdate(
        "Awesome! I've updated your 10am meal for today to be 2 hard-boiled eggs and 1 medium apple."
      ),
      true
    );
    assert.equal(claimsMealPlanUpdate('Updated your snack meal with greek yogurt.'), true);
  });

  it('does not flag suggestions or time/name wording alone', () => {
    assert.equal(
      claimsMealPlanUpdate('Here are 3 options:\n1. Eggs (~235 cal)\nThat comes out to about 235 calories.'),
      false
    );
    assert.equal(claimsMealPlanUpdate('Your daily water goal is now 80 oz.'), false);
  });
});

describe('claimsCompletion', () => {
  it('flags hollow acknowledgments that imply an action finished', () => {
    // The exact false positives from the reported conversation.
    assert.equal(claimsCompletion('Derek, got it!'), true);
    assert.equal(claimsCompletion('Got it!'), true);
    assert.equal(claimsCompletion('All set — added that for you.'), true);
    assert.equal(claimsCompletion('Done!'), true);
  });

  it('does not flag questions, negations, or substantive non-claims', () => {
    assert.equal(claimsCompletion('Would you like me to pull up your Lunch details?'), false);
    assert.equal(claimsCompletion("I can't add that from here yet."), false);
    assert.equal(
      claimsCompletion(
        'Here are 3 options:\n1. Chicken Fajitas (~450 cal)\n2. Shrimp Ceviche (~320 cal)\nWhich sounds best?'
      ),
      false
    );
  });
});

describe('claimsHydrationGoalSet', () => {
  it('flags real completion claims', () => {
    assert.equal(claimsHydrationGoalSet('Your daily water goal is now 120 oz.'), true);
    assert.equal(claimsHydrationGoalSet("I've set your water goal to 120 oz."), true);
    assert.equal(claimsHydrationGoalSet('Updated your water goal to 128.'), true);
  });

  it('does NOT clobber advice, offers, or recommendations (the reported bug)', () => {
    assert.equal(
      claimsHydrationGoalSet('For 238 lbs, I’d recommend about 120 oz a day. Want me to set that as your goal?'),
      false
    );
    assert.equal(claimsHydrationGoalSet("I'll set your water goal to 120 oz once you confirm."), false);
    assert.equal(claimsHydrationGoalSet('I can set your water goal to 120 oz — just say the word.'), false);
    assert.equal(claimsHydrationGoalSet('A good daily water goal for you is around 120 oz.'), false);
  });
});

describe('userRequestedMealAction', () => {
  it('recognizes plan-change requests, including combined ones', () => {
    assert.equal(userRequestedMealAction('Let’s do 1, and make the time for the meal 6:30 PM'), true);
    assert.equal(userRequestedMealAction('add a banana to breakfast'), true);
    assert.equal(userRequestedMealAction('rename lunch to Power Bowl'), true);
  });

  it('ignores pure questions and small talk', () => {
    assert.equal(userRequestedMealAction('what are my macros for lunch?'), false);
    assert.equal(userRequestedMealAction('thanks, that helps!'), false);
  });
});
