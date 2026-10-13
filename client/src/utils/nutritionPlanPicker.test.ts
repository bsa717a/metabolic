import { describe, expect, it } from 'vitest';
import {
  APPLY_NUTRITION_PLAN_HINT,
  assignedNutritionPlan,
  incompleteProfilePlanNote,
  NO_NUTRITION_PLAN_ASSIGNED,
  nutritionPlanPickerOptions,
  nutritionPlanPickerValue
} from './nutritionPlanPicker';

describe('nutrition plan picker', () => {
  it('is Choose a plan when nothing is assigned', () => {
    expect(assignedNutritionPlan(null)).toBeNull();
    expect(assignedNutritionPlan({ templateId: null, templateName: null })).toBeNull();
    expect(nutritionPlanPickerValue(null, null)).toBe('');
    const library = nutritionPlanPickerOptions(
      [{ id: 'rachel', name: 'Rachel George current meals (2026-07-13)' }],
      null
    );
    expect(library.map((plan) => plan.name)).toEqual(['Rachel George current meals (2026-07-13)']);
    expect(nutritionPlanPickerValue(null, null)).not.toBe(library[0]?.id);
    expect(NO_NUTRITION_PLAN_ASSIGNED).toBe('No plan is assigned.');
    expect(APPLY_NUTRITION_PLAN_HINT).toBe("Applying replaces this day's planned meals.");
  });

  it('selects the assigned plan, not the first catalog row', () => {
    const assigned = assignedNutritionPlan({
      templateId: 'amy-plan',
      templateName: 'Current meals (2026-07-13)'
    });
    expect(assigned).toEqual({ id: 'amy-plan', name: 'Current meals (2026-07-13)' });
    expect(nutritionPlanPickerValue('amy-plan', null)).toBe('amy-plan');
    const options = nutritionPlanPickerOptions(
      [{ id: 'library', name: 'Band plan' }],
      assigned
    );
    expect(options.map((plan) => plan.id)).toEqual(['amy-plan', 'library']);
    expect(nutritionPlanPickerValue('amy-plan', '')).toBe('');
    expect(nutritionPlanPickerValue('amy-plan', 'library')).toBe('library');
  });

  it('names exactly the missing profile fields', () => {
    expect(incompleteProfilePlanNote(['gender', 'height'])).toBe(
      'Add gender and height to see plans matched to this client.'
    );
    expect(incompleteProfilePlanNote(['weight'])).toBe('Add weight to see plans matched to this client.');
    expect(incompleteProfilePlanNote(['gender', 'height', 'weight'])).toBe(
      'Add gender, height, and weight to see plans matched to this client.'
    );
    expect(incompleteProfilePlanNote([])).toBe('');
  });
});
