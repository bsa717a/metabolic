import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogDefaultsToPrescription,
  composeRoutineDayExercises,
  removalEmptiesRoutineDay,
  routineDateKeepsManualEdits,
  routineWeekdayIsRest,
  type RoutineExtraSnapshot,
  type RoutineTemplateItemSnapshot
} from './exerciseRoutineDayEdits.js';

function templateItem(
  id: string,
  exerciseId: string,
  sortOrder: number,
  sets = 3,
  reps = '10'
): RoutineTemplateItemSnapshot {
  return {
    id,
    exerciseId,
    sortOrder,
    sets,
    reps,
    speed: '1/2',
    durationSeconds: null,
    distance: null,
    weight: null
  };
}

function extra(id: string, exerciseId: string, sortOrder: number): RoutineExtraSnapshot {
  return {
    id,
    exerciseId,
    sortOrder,
    sets: 4,
    reps: '8',
    speed: null,
    durationSeconds: 30,
    distance: null,
    weight: null
  };
}

describe('composeRoutineDayExercises', () => {
  const templateItems = [
    templateItem('push', 'pushup', 0),
    templateItem('squat', 'squat', 1),
    templateItem('row', 'row', 2)
  ];

  it('hides excluded plan exercises and appends exercises added on the routine', () => {
    const composed = composeRoutineDayExercises({
      templateItems,
      excludedTemplateItemIds: ['squat'],
      overridesByTemplateItemId: new Map([['push', { sets: 5, reps: '15/12/10' }]]),
      extras: [extra('added', 'plank', 0)]
    });

    assert.deepEqual(
      composed.map((item) => ({
        exerciseId: item.exerciseId,
        sets: item.sets,
        reps: item.reps,
        templateItemId: item.templateItemId,
        extraId: item.extraId
      })),
      [
        { exerciseId: 'pushup', sets: 5, reps: '15/12/10', templateItemId: 'push', extraId: null },
        { exerciseId: 'row', sets: 3, reps: '10', templateItemId: 'row', extraId: null },
        { exerciseId: 'plank', sets: 4, reps: '8', templateItemId: null, extraId: 'added' }
      ]
    );
    assert.equal(composed.some((item) => item.exerciseId === 'squat'), false);
  });

  it('keeps a rest weekday that only has an added exercise', () => {
    const composed = composeRoutineDayExercises({
      templateItems: [],
      excludedTemplateItemIds: [],
      extras: [extra('added', 'walk', 0)]
    });
    assert.equal(composed.length, 1);
    assert.equal(composed[0]?.extraId, 'added');
  });
});

describe('removalEmptiesRoutineDay', () => {
  it('leaves the day in place when other exercises remain', () => {
    assert.equal(
      removalEmptiesRoutineDay({
        templateItemIds: ['a', 'b'],
        excludedTemplateItemIds: [],
        extraIds: [],
        remove: { templateItemId: 'a' }
      }),
      false
    );
  });

  it('becomes rest when the last plan exercise is removed', () => {
    assert.equal(
      removalEmptiesRoutineDay({
        templateItemIds: ['a', 'b'],
        excludedTemplateItemIds: ['a'],
        extraIds: [],
        remove: { templateItemId: 'b' }
      }),
      true
    );
  });

  it('becomes rest when the last added exercise is removed from an empty plan day', () => {
    assert.equal(
      removalEmptiesRoutineDay({
        templateItemIds: [],
        excludedTemplateItemIds: [],
        extraIds: ['extra-1'],
        remove: { extraId: 'extra-1' }
      }),
      true
    );
  });
});

describe('routineDateKeepsManualEdits', () => {
  it('protects a calendar day the person already changed', () => {
    assert.equal(
      routineDateKeepsManualEdits({ exercisesManuallyEdited: true, loggedWorkCount: 0 }),
      true
    );
  });

  it('protects a day with logged work', () => {
    assert.equal(
      routineDateKeepsManualEdits({ exercisesManuallyEdited: false, loggedWorkCount: 1 }),
      true
    );
  });

  it('allows a plan apply to fill a day they have not edited', () => {
    assert.equal(
      routineDateKeepsManualEdits({ exercisesManuallyEdited: false, loggedWorkCount: 0 }),
      false
    );
  });
});

describe('routineWeekdayIsRest', () => {
  it('treats an empty weekday as rest', () => {
    assert.equal(routineWeekdayIsRest({ templateId: null, extraCount: 0 }), true);
  });

  it('does not treat a plan day or a day with an added exercise as rest', () => {
    assert.equal(routineWeekdayIsRest({ templateId: 'push', extraCount: 0 }), false);
    assert.equal(routineWeekdayIsRest({ templateId: null, extraCount: 1 }), false);
    assert.equal(routineWeekdayIsRest(null), false);
  });
});

describe('catalogDefaultsToPrescription', () => {
  it('uses the exercise usual sets and reps', () => {
    assert.deepEqual(
      catalogDefaultsToPrescription({
        defaultSets: 3,
        defaultReps: 8,
        defaultDurationSeconds: null,
        defaultDistance: null
      }),
      {
        sets: 3,
        reps: '8',
        speed: null,
        durationSeconds: null,
        distance: null,
        weight: null
      }
    );
  });
});
