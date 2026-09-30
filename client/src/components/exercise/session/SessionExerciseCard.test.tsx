import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionExerciseCard } from './SessionExerciseCard';
import type { SessionExerciseMeta } from '../../../utils/workoutSession';

function meta(partial: Partial<SessionExerciseMeta>): SessionExerciseMeta {
  return {
    id: 'a',
    name: 'Move',
    sets: null,
    reps: null,
    speed: null,
    weight: null,
    durationSeconds: null,
    distance: null,
    ...partial
  };
}

function render(partial: Partial<SessionExerciseMeta>, remainingMs: number | null = null) {
  return renderToStaticMarkup(
    <SessionExerciseCard
      meta={meta(partial)}
      currentSet={1}
      per={{ setsDone: 0 }}
      durationRemainingMs={remainingMs}
      paused={false}
      onCompleteSet={() => {}}
      onAdjust={() => {}}
      onSkip={() => {}}
      onPause={() => {}}
      onResume={() => {}}
    />
  );
}

describe('SessionExerciseCard prescriptions', () => {
  it('shows the rep stepper for a rep-only set', () => {
    const html = render({ name: 'Bench', sets: 3, reps: '10' });
    expect(html).toContain('Set 1 of 3');
    expect(html).toContain('aria-label="Decrease Reps"');
    expect(html).toContain('Complete set');
    expect(html).not.toContain('>Pause<');
  });

  it('keeps a single countdown and no rep stepper when there are no sets', () => {
    const html = render({ name: 'Run', durationSeconds: 45 }, 45_000);
    expect(html).toContain('45s');
    expect(html).toContain('>Pause<');
    expect(html).toContain('Actual duration');
    expect(html).toContain('>Done<');
    expect(html).not.toContain('aria-label="Decrease Reps"');
  });

  it('times each set without a rep stepper when only duration is set', () => {
    const html = render({ name: 'Plank', sets: 3, durationSeconds: 30 }, 30_000);
    expect(html).toContain('Set 1 of 3');
    expect(html).toContain('30s');
    expect(html).toContain('>Pause<');
    expect(html).toContain('>Done<');
    expect(html).not.toContain('aria-label="Decrease Reps"');
    expect(html).not.toContain('Actual duration');
  });

  it('shows the rep stepper and the countdown when both are set', () => {
    const html = render({ name: 'Push-up', sets: 3, reps: '15/12/10', durationSeconds: 30 }, 30_000);
    expect(html).toContain('30s');
    expect(html).toContain('aria-label="Decrease Reps"');
    expect(html).toContain('>Pause<');
    expect(html).toContain('>Done<');
  });
});
