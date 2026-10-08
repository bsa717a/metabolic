import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildClientProfileData,
  heightFieldsFromProfile,
  shouldApplyImportedCoachChoice,
  shouldPreserveImportedProgram
} from './onboardingSetupGuards.js';

describe('heightFieldsFromProfile', () => {
  it('splits stored height inches into feet and inches', () => {
    assert.deepEqual(heightFieldsFromProfile(66, null), { heightFeet: '5', heightInches: '6' });
  });

  it('keeps a zero inch remainder', () => {
    assert.deepEqual(heightFieldsFromProfile(60, null), { heightFeet: '5', heightInches: '0' });
  });

  it('parses heightRaw when inches were not stored', () => {
    assert.deepEqual(heightFieldsFromProfile(null, `5'6"`), { heightFeet: '5', heightInches: '6' });
  });
});

describe('shouldPreserveImportedProgram', () => {
  it('preserves a program that already has meals, workouts, or a coach', () => {
    assert.equal(
      shouldPreserveImportedProgram({
        mealCount: 2,
        exerciseCount: 0,
        coachId: null,
        hasActiveCoachAssignment: false
      }),
      true
    );
    assert.equal(
      shouldPreserveImportedProgram({
        mealCount: 0,
        exerciseCount: 3,
        coachId: null,
        hasActiveCoachAssignment: false
      }),
      true
    );
    assert.equal(
      shouldPreserveImportedProgram({
        mealCount: 0,
        exerciseCount: 0,
        coachId: 'coach-1',
        hasActiveCoachAssignment: false
      }),
      true
    );
    assert.equal(
      shouldPreserveImportedProgram({
        mealCount: 0,
        exerciseCount: 0,
        coachId: null,
        hasActiveCoachAssignment: true
      }),
      true
    );
  });

  it('still allows an empty program to be filled in', () => {
    assert.equal(
      shouldPreserveImportedProgram({
        mealCount: 0,
        exerciseCount: 0,
        coachId: null,
        hasActiveCoachAssignment: false
      }),
      false
    );
  });
});

describe('shouldApplyImportedCoachChoice', () => {
  it('applies a code or a request only when the imported user has no coach', () => {
    assert.equal(
      shouldApplyImportedCoachChoice({
        hasActiveCoachAssignment: false,
        programCoachId: null,
        coachCode: 'DF',
        wantsCoach: false
      }),
      true
    );
    assert.equal(
      shouldApplyImportedCoachChoice({
        hasActiveCoachAssignment: false,
        programCoachId: null,
        coachCode: '   ',
        wantsCoach: true
      }),
      true
    );
  });

  it('does not apply a code or a blank code when a coach is already linked', () => {
    assert.equal(
      shouldApplyImportedCoachChoice({
        hasActiveCoachAssignment: true,
        programCoachId: null,
        coachCode: 'DF',
        wantsCoach: true
      }),
      false
    );
    assert.equal(
      shouldApplyImportedCoachChoice({
        hasActiveCoachAssignment: false,
        programCoachId: 'coach-1',
        coachCode: '',
        wantsCoach: true
      }),
      false
    );
    assert.equal(
      shouldApplyImportedCoachChoice({
        hasActiveCoachAssignment: false,
        programCoachId: null,
        coachCode: '   ',
        wantsCoach: false
      }),
      false
    );
  });
});

describe('buildClientProfileData', () => {
  it('does not wipe food notes when the fields are blank', () => {
    const data = buildClientProfileData({
      weight: 180,
      goalWeight: 170,
      foodAllergies: '   ',
      dietaryPreferences: ''
    });
    assert.equal('foodConditions' in data, false);
    assert.equal('dietNotes' in data, false);
  });

  it('keeps imported food notes when they are confirmed', () => {
    const data = buildClientProfileData({
      weight: 189.4,
      goalWeight: 170,
      foodAllergies: 'Lactose',
      dietaryPreferences: 'High protein'
    });
    assert.equal(data.foodConditions, 'Lactose');
    assert.equal(data.dietNotes, 'High protein');
  });
});
