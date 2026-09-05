import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSessionRecapEmail,
  formatSessionRecapMeeting,
  formatSessionRecapQuantity,
  formatSessionRecapTime,
  weekdayLabel
} from './sessionRecapEmail.js';

const baseInput = {
  clientFirstName: 'Alex',
  coachName: 'Jordan Lee',
  notes: 'Great energy today.\nKeep protein high at breakfast.',
  nextMeetingAt: new Date('2026-09-11T16:00:00.000Z'),
  timeZone: 'UTC',
  tomorrowDateKey: '2026-09-05',
  tomorrowMeals: [
    {
      name: 'Breakfast',
      plannedTime: '07:30',
      calories: 420,
      protein: 32,
      carbs: 40,
      fat: 14,
      items: [{ name: 'Eggs', quantity: 3, unit: 'large' }]
    }
  ],
  weekRoutine: [
    { weekday: 0, workoutName: 'Push' },
    { weekday: 1, workoutName: null },
    { weekday: 2, workoutName: 'Pull' }
  ],
  tomorrowWorkoutName: 'Push',
  links: {
    dashboard: 'https://app.example.com',
    nutrition: 'https://app.example.com/nutrition',
    exercise: 'https://app.example.com/exercise'
  }
};

describe('sessionRecapEmail', () => {
  it('puts notes, next meeting, tomorrow meals, then the week of routines', () => {
    const email = buildSessionRecapEmail(baseInput);
    const notesAt = email.text.indexOf('FROM YOUR COACH');
    const nextAt = email.text.indexOf('SEE YOU NEXT');
    const mealsAt = email.text.indexOf("TOMORROW'S PLATE");
    const weekAt = email.text.indexOf("THIS WEEK'S WORKOUTS");

    assert.ok(notesAt >= 0);
    assert.ok(notesAt < nextAt);
    assert.ok(nextAt < mealsAt);
    assert.ok(mealsAt < weekAt);
    assert.match(email.text, /Great energy today/);
    assert.match(email.text, /Keep protein high at breakfast/);
    assert.match(email.html, /Great energy today\.<br>Keep protein high at breakfast\./);
    assert.match(email.text, /SATURDAY, SEPTEMBER 5/);
    assert.match(email.text, /3 large Eggs/);
    assert.match(email.text, /Monday — Push/);
    assert.match(email.text, /Tuesday — Rest day/);
    assert.doesNotMatch(email.text, /sets/);
  });

  it('keeps the same section order in HTML', () => {
    const html = buildSessionRecapEmail(baseInput).html;
    const notesAt = html.indexOf('From your coach');
    const nextAt = html.indexOf('See you next');
    const mealsAt = html.indexOf("Tomorrow's plate");
    const weekAt = html.indexOf("This week's workouts");
    assert.ok(notesAt >= 0 && notesAt < nextAt && nextAt < mealsAt && mealsAt < weekAt);
  });

  it('uses a fun, personal subject line', () => {
    const email = buildSessionRecapEmail(baseInput);
    assert.equal(email.subject, 'Alex, your recap from Jordan Lee is in');
    assert.match(email.html, /Session recap, served hot/);
    assert.match(email.text, /packed the good stuff/);
  });

  it('still leads with a notes section when the coach left none', () => {
    const email = buildSessionRecapEmail({ ...baseInput, notes: '   ' });
    assert.match(email.text, /FROM YOUR COACH/);
    assert.match(email.text, /didn't leave written notes/);
    assert.ok(email.text.indexOf('FROM YOUR COACH') < email.text.indexOf('SEE YOU NEXT'));
  });

  it('explains a missing next session instead of skipping it', () => {
    const email = buildSessionRecapEmail({ ...baseInput, nextMeetingAt: null });
    assert.match(email.text, /No next session on the calendar yet/);
    assert.match(email.html, /lock in a time/);
  });

  it('escapes HTML in coach notes', () => {
    const email = buildSessionRecapEmail({ ...baseInput, notes: 'Stay <strong> & hydrated' });
    assert.match(email.html, /Stay &lt;strong&gt; &amp; hydrated/);
    assert.doesNotMatch(email.html, /Stay <strong>/);
  });

  it('formats meeting time, meal time, quantities, and weekday labels', () => {
    assert.equal(formatSessionRecapTime('07:30'), '7:30am');
    assert.equal(formatSessionRecapTime('18:00'), '6pm');
    assert.equal(formatSessionRecapQuantity(3, 'large', 'Eggs'), '3 large Eggs');
    assert.equal(weekdayLabel(0), 'Monday');
    assert.match(formatSessionRecapMeeting(new Date('2026-09-11T16:00:00.000Z'), 'UTC'), /September 11/);
  });
});
