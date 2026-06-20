import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assistantResponseLooksLikeMealFailure,
  classifyFoodRegex,
  extractFoodDescription,
  isEffectivelyZeroCalories,
  isMealCorrectionMessage,
  looksLikeFoodLogRetry,
  mergeFoodLogFollowUp,
  parseFoodLogAction,
  parseLoggedFoodFromAssistantResponse,
  parsePhotoEstimateFoodNames,
  parsePhotoEstimateIntent,
  parsePhotoEstimateTotals,
  serializePhotoEstimateIntent,
  parseTargetMealFromText,
  smsZeroCalorieCheckResponse,
  wantsMacroStatus,
  wantsPhotoLog
} from './smsFoodParse.js';

describe('parseTargetMealFromText', () => {
  it('uses the last for-meal phrase in corrections', () => {
    assert.equal(
      parseTargetMealFromText('Why would you log that for lunch? I said that I had it for breakfast'),
      'breakfast'
    );
  });

  it('reads meal from add-to phrasing', () => {
    assert.equal(parseTargetMealFromText('Add 2 ounces of peanuts to my breakfast'), 'breakfast');
  });
});

describe('parseFoodLogAction', () => {
  it('parses add-to-breakfast from the screenshot thread', () => {
    assert.deepEqual(parseFoodLogAction('Add 2 ounces of peanuts to my breakfast, I ate those shortly after breakfast'), {
      intent: 'LOG_FOOD',
      foodText: '2 ounces of peanuts',
      mealName: 'breakfast'
    });
  });

  it('normalizes meal name on log-for phrasing', () => {
    assert.deepEqual(
      parseFoodLogAction('I want to log that I ate 2 ounces of peanuts for breakfast along with the other foods'),
      {
        intent: 'LOG_FOOD',
        foodText: '2 ounces of peanuts',
        mealName: 'breakfast'
      }
    );
  });
});

describe('classifyFoodRegex', () => {
  it('does not treat correction questions as food logs', () => {
    assert.equal(
      classifyFoodRegex('Why would you like that for lunch? I said that I had it for breakfast'),
      null
    );
  });

  it('routes natural ate-for phrasing to log', () => {
    assert.equal(classifyFoodRegex('I had 2 oz peanuts for breakfast'), 'LOG_FOOD');
  });
});

describe('extractFoodDescription', () => {
  it('strips trailing for-meal without eating mid-sentence meal names', () => {
    assert.equal(extractFoodDescription('I had 2 oz peanuts for breakfast'), '2 oz peanuts');
  });
});

describe('meal correction detection', () => {
  it('detects move-to-breakfast corrections', () => {
    assert.equal(isMealCorrectionMessage('That should be breakfast not lunch'), true);
    assert.equal(parseFoodLogAction('That should be breakfast not lunch').intent, 'MEAL_CORRECTION');
  });
});

describe('follow-up merge', () => {
  it('combines food from prior message with meal from follow-up', () => {
    assert.deepEqual(
      mergeFoodLogFollowUp('Add 2 ounces of peanuts to my breakfast', 'for breakfast'),
      { foodText: '2 ounces of peanuts', mealName: 'breakfast' }
    );
  });
});

describe('parseLoggedFoodFromAssistantResponse', () => {
  it('parses logged food lines from outbound SMS', () => {
    assert.deepEqual(
      parseLoggedFoodFromAssistantResponse(
        'Logged to Lunch: 2 ounces peanuts — about 322 cal and 15g protein. You have 1485 cal left today.'
      ),
      { mealName: 'Lunch', foodNames: ['2 ounces peanuts'] }
    );
  });

  it('parses photo caption logs that combine estimate and logged meal', () => {
    assert.deepEqual(
      parseLoggedFoodFromAssistantResponse(
        'Estimated from your plate: 450 cal, 35g protein, 40g carbs, 12g fat. I see: chicken, rice. Photo estimates are approximate. Logged to Lunch.'
      ),
      { mealName: 'Lunch', foodNames: ['chicken', 'rice'] }
    );
  });
});

describe('photo estimate intent storage', () => {
  it('round-trips stored photo estimate items', () => {
    const intent = serializePhotoEstimateIntent(
      [{ name: 'chicken', calories: 300, protein: 30, carbs: 0, fat: 10 }],
      'Lunch'
    );
    assert.deepEqual(parsePhotoEstimateIntent(intent), {
      items: [{ name: 'chicken', calories: 300, protein: 30, carbs: 0, fat: 10 }],
      mealName: 'Lunch'
    });
  });

  it('parses macro totals from estimate text', () => {
    assert.deepEqual(parsePhotoEstimateTotals('Estimated from your plate: 450 cal, 35g protein, 40g carbs, 12g fat. I see: chicken.'), {
      calories: 450,
      protein: 35,
      carbs: 40,
      fat: 12
    });
  });
});

describe('assistantResponseLooksLikeMealFailure', () => {
  it('flags meal lookup failures', () => {
    assert.equal(
      assistantResponseLooksLikeMealFailure(
        'Breakfast is already marked complete. Try texting: "Add 2 oz peanuts to breakfast".'
      ),
      true
    );
  });
});

describe('zero calorie checks', () => {
  it('detects zero macro logs', () => {
    assert.equal(isEffectivelyZeroCalories(0, 0), true);
    assert.equal(isEffectivelyZeroCalories(0, 5), false);
    assert.equal(isEffectivelyZeroCalories(10, 0), false);
  });

  it('asks for clarification instead of confirming a zero-cal log', () => {
    assert.match(
      smsZeroCalorieCheckResponse('Why would you like that', 'Lunch'),
      /0 calories.*Did I get the food wrong/i
    );
  });
});

describe('wantsMacroStatus', () => {
  it('does not treat food mentions as macro status', () => {
    assert.equal(wantsMacroStatus('I had a protein shake for breakfast'), false);
    assert.equal(parseFoodLogAction('I had a protein shake for breakfast').intent, null);
  });

  it('still catches macro status questions', () => {
    assert.equal(wantsMacroStatus('calories remaining'), true);
    assert.equal(wantsMacroStatus('how much protein left'), true);
  });
});

describe('looksLikeFoodLogRetry', () => {
  it('requires food-like text after a meal failure', () => {
    const context = {
      priorInbound: 'Add peanuts to breakfast',
      priorOutbound: 'Breakfast is already marked complete. Try texting: "Add 2 oz peanuts to breakfast".'
    };
    assert.equal(looksLikeFoodLogRetry('thanks', context), false);
    assert.equal(looksLikeFoodLogRetry('2 oz peanuts for breakfast', context), true);
  });
});

describe('meal photo preview vs log', () => {
  it('does not treat a plain photo caption as log intent', () => {
    assert.equal(wantsPhotoLog(''), false);
    assert.equal(wantsPhotoLog('what is this'), false);
  });

  it('logs when the caption asks to log', () => {
    assert.equal(wantsPhotoLog('log this for lunch'), true);
  });

  it('supports follow-up logging after an estimate', () => {
    assert.equal(parseFoodLogAction('log that for breakfast').intent, 'LOG_PHOTO_ESTIMATE');
    assert.deepEqual(parsePhotoEstimateFoodNames(
      'Estimated from your plate: 450 cal, 35g protein, 40g carbs, 12g fat. I see: chicken, rice. Photo estimates are approximate. Nothing logged yet.'
    ), ['chicken', 'rice']);
  });
});
