import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCheckIn,
  blockLabel,
  buildAutoView,
  buildTrackCatalog,
  initialProgress,
  planLocation,
  progressStartingOnPlan,
  reconcileProgress,
  type AutoPlanInput,
  type AutoProgress
} from './exerciseAutoTrack.js';

function item(name: string, requiresGym = false) {
  return {
    id: `${name}-item`,
    sortOrder: 0,
    sets: 3,
    reps: '10',
    speed: '1/2',
    durationSeconds: null,
    distance: null,
    weight: null,
    exerciseName: name,
    bodyPart: null,
    requiresGym
  };
}

function plan(name: string, days: string[], requiresGym = false): AutoPlanInput {
  return {
    id: name,
    name,
    days: days.map((dayName, index) => ({
      id: `${name}-${dayName}`,
      name: dayName,
      dayIndex: index + 1,
      items: [item(dayName === 'Legs' ? 'Goblet squat' : 'Push-up', requiresGym)]
    }))
  };
}

const catalogPlans = [
  plan('3 Day Gym Split', ['Push', 'Legs', 'Pull']),
  plan('4 Day Gym Split', ['Push', 'Legs', 'Pull', 'Arms']),
  plan('5 Day Gym Split', ['Push', 'Legs', 'Pull', 'Arms', 'Conditioning']),
  plan('3 Day Home', ['Push', 'Legs', 'Pull']),
  plan('4 Day Home', ['Push', 'Legs', 'Pull', 'Full body'])
];

describe('plan grouping', () => {
  it('labels plans as compact track names', () => {
    assert.equal(blockLabel('3 Day Gym Split'), '3-day gym split');
    assert.equal(blockLabel('4-Day Split'), '4-day split');
  });

  it('sends named home plans home and 3-day splits to the gym', () => {
    assert.equal(planLocation(plan('3 Day Home', ['Push', 'Legs', 'Pull'])), 'HOME');
    assert.equal(planLocation(plan('3 Day Split', ['Push', 'Legs', 'Pull'])), 'GYM');
    assert.equal(planLocation(plan('Band circuit', ['A', 'B'], false)), 'HOME');
    assert.equal(planLocation(plan('Machines', ['A', 'B'], true)), 'GYM');
  });

  it('builds six tracks from existing plans without adding exercises', () => {
    const tracks = buildTrackCatalog(catalogPlans);
    assert.equal(tracks.length, 6);
    const beginnerGym = tracks.find((track) => track.location === 'GYM' && track.level === 'BEGINNER');
    const intermediateGym = tracks.find((track) => track.location === 'GYM' && track.level === 'INTERMEDIATE');
    const hardGym = tracks.find((track) => track.location === 'GYM' && track.level === 'HARD');
    const beginnerHome = tracks.find((track) => track.location === 'HOME' && track.level === 'BEGINNER');
    assert.deepEqual(
      beginnerGym?.blocks.map((block) => block.label),
      ['3-day gym split', '4-day gym split', '5-day gym split']
    );
    assert.deepEqual(
      intermediateGym?.blocks.map((block) => block.label),
      ['4-day gym split', '5-day gym split']
    );
    assert.deepEqual(
      hardGym?.blocks.map((block) => block.label),
      ['5-day gym split']
    );
    assert.deepEqual(
      intermediateGym?.blocks.map((block) => block.name),
      ['4 Day Gym Split', '5 Day Gym Split']
    );
    assert.deepEqual(
      beginnerGym?.blocks.map((block) => block.name),
      ['3 Day Gym Split', '4 Day Gym Split', '5 Day Gym Split']
    );
    assert.deepEqual(
      beginnerHome?.blocks.map((block) => block.label),
      ['3-day home', '4-day home']
    );
    assert.equal(beginnerGym?.blocks[0].days[1].name, 'Legs');
  });
});

describe('progression asks and never decides', () => {
  const blocks = buildTrackCatalog(catalogPlans).find(
    (track) => track.location === 'GYM' && track.level === 'BEGINNER'
  )!.blocks;

  function view(progress: AutoProgress, today: string, complete = false) {
    return buildAutoView({ blocks, progress, today, todayWorkoutComplete: complete });
  }

  it('starts on week 1 of the 3-day gym split at 10 reps', () => {
    const { track } = view(initialProgress('2026-10-02'), '2026-10-02');
    assert.equal(track.today?.headline, 'Day 1 · Push · 10');
    assert.equal(track.today?.summary, 'Week 1 of 3 · 3-day gym split');
    assert.equal(track.today?.exercises[0].reps, '10');
    assert.deepEqual(
      track.weeks.map((week) => week.status),
      ['current', 'upcoming', 'upcoming']
    );
    assert.equal(track.upNext?.label, '4-day gym split');
    assert.equal(track.checkIn, null);
    assert.equal(track.selectedPlanId, '3 Day Gym Split');
    assert.deepEqual(
      track.plans.map((plan) => plan.name),
      ['3 Day Gym Split', '4 Day Gym Split', '5 Day Gym Split']
    );
  });

  it('starts on the plan chosen for this level', () => {
    const started = progressStartingOnPlan(blocks, '5 Day Gym Split', '2026-10-02');
    assert.equal(started.blockIndex, 2);
    assert.equal(started.weekIndex, 0);
    assert.equal(started.dayIndex, 0);
    assert.equal(started.pendingCheckIn, 'NONE');
    const { track } = view(started, '2026-10-02');
    assert.equal(track.selectedPlanId, '5 Day Gym Split');
    assert.equal(track.today?.headline, 'Day 1 · Push · 10');
    assert.equal(track.today?.summary, 'Week 1 of 3 · 5-day gym split');
    assert.throws(() => progressStartingOnPlan(blocks, '3 Day Home', '2026-10-02'), /not available for this level/);
  });

  it('shows the current week scheme on every day in the block', () => {
    const progress = { ...initialProgress('2026-10-02'), weekIndex: 1, dayIndex: 1 };
    const { track } = view(progress, '2026-10-02');
    assert.equal(track.today?.headline, 'Day 2 · Legs · 15/12/10');
    assert.equal(track.days[2].name, 'Pull');
    assert.equal(track.days[1].exercises[0].reps, '15/12/10');
    assert.deepEqual(
      track.weeks.map((week) => week.status),
      ['done', 'current', 'upcoming']
    );
  });

  it('keeps the same day until the next calendar day after it is finished', () => {
    const progress = { ...initialProgress('2026-10-02'), dayIndex: 0 };
    const sameDay = view(progress, '2026-10-02', true);
    assert.equal(sameDay.progress.dayIndex, 0);
    assert.equal(sameDay.progress.dayCompletedOn, '2026-10-02');
    assert.equal(sameDay.track.today?.complete, true);
    assert.equal(sameDay.track.pendingCheckIn, 'NONE');

    const nextDay = view(sameDay.progress, '2026-10-03', false);
    assert.equal(nextDay.progress.dayIndex, 1);
    assert.equal(nextDay.progress.pendingCheckIn, 'NONE');
    assert.equal(nextDay.track.today?.headline, 'Day 2 · Legs · 10');
  });

  it('asks to move up or repeat when a block is finished', () => {
    const progress: AutoProgress = {
      ...initialProgress('2026-10-01'),
      weekIndex: 2,
      dayIndex: 2,
      dayCompletedOn: '2026-10-01'
    };
    const { progress: next, track } = view(progress, '2026-10-02');
    assert.equal(next.pendingCheckIn, 'BLOCK_COMPLETE');
    assert.equal(next.blockIndex, 0);
    assert.equal(track.checkIn?.title, 'You finished the 3-day gym split!');
    assert.equal(track.checkIn?.moveUpLabel, 'Move up to 4-day gym split');
    assert.equal(track.checkIn?.repeatBlockLabel, 'Repeat this block');
    assert.deepEqual(
      track.weeks.map((week) => week.status),
      ['done', 'done', 'done']
    );
  });

  it('moves up only after the user chooses it', () => {
    const waiting: AutoProgress = {
      ...initialProgress('2026-10-02'),
      weekIndex: 2,
      dayIndex: 2,
      pendingCheckIn: 'BLOCK_COMPLETE'
    };
    const moved = applyCheckIn(waiting, 'move_up', '2026-10-02', blocks.length);
    assert.equal(moved.blockIndex, 1);
    assert.equal(moved.weekIndex, 0);
    assert.equal(moved.dayIndex, 0);
    assert.equal(moved.pendingCheckIn, 'NONE');
    const { track } = view(moved, '2026-10-02');
    assert.equal(track.today?.summary, 'Week 1 of 3 · 4-day gym split');

    const repeated = applyCheckIn(waiting, 'repeat_block', '2026-10-02', blocks.length);
    assert.equal(repeated.blockIndex, 0);
    assert.equal(repeated.weekIndex, 0);
    assert.equal(repeated.pendingCheckIn, 'NONE');
  });

  it('does not skip ahead when a finished day is already a week old', () => {
    const progress: AutoProgress = {
      ...initialProgress('2026-09-20'),
      dayIndex: 0,
      dayCompletedOn: '2026-09-20'
    };
    const { progress: next } = view(progress, '2026-10-02');
    assert.equal(next.pendingCheckIn, 'MISSED_WEEK');
    assert.equal(next.dayIndex, 0);
    assert.equal(next.weekIndex, 0);
  });

  it('asks after a missed week and waits for repeat or keep going', () => {
    const progress = { ...initialProgress('2026-09-20'), dayIndex: 1 };
    const { progress: next, track } = view(progress, '2026-10-02');
    assert.equal(next.pendingCheckIn, 'MISSED_WEEK');
    assert.equal(next.weekIndex, 0);
    assert.equal(next.dayIndex, 1);
    assert.equal(track.checkIn?.title, 'Looks like you missed last week.');
    assert.equal(track.checkIn?.repeatWeekLabel, 'Repeat last week');
    assert.equal(track.checkIn?.keepGoingLabel, 'Keep going');

    const repeated = applyCheckIn(next, 'repeat_week', '2026-10-02', blocks.length);
    assert.equal(repeated.weekIndex, 0);
    assert.equal(repeated.dayIndex, 0);
    assert.equal(repeated.weekStartedOn, '2026-10-02');
    assert.equal(repeated.pendingCheckIn, 'NONE');

    const kept = applyCheckIn(next, 'keep_going', '2026-10-02', blocks.length);
    assert.equal(kept.weekIndex, 1);
    assert.equal(kept.dayIndex, 0);
    assert.equal(kept.pendingCheckIn, 'NONE');
  });

  it('turns keep-going on the last week into a block check-in instead of skipping ahead', () => {
    const missed: AutoProgress = {
      ...initialProgress('2026-09-20'),
      weekIndex: 2,
      dayIndex: 1,
      pendingCheckIn: 'MISSED_WEEK'
    };
    const next = applyCheckIn(missed, 'keep_going', '2026-10-02', blocks.length);
    assert.equal(next.pendingCheckIn, 'BLOCK_COMPLETE');
    assert.equal(next.blockIndex, 0);
    assert.equal(next.weekIndex, 2);
  });
});
