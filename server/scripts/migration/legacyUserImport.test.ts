import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accountAction,
  currentPlanTitle,
  displayNameFromLegacy,
  foreignSessionPrograms,
  parseImportArgs,
  programsForSessions,
  sessionsForUser
} from './legacyUserImport.ts';

test('parseImportArgs keeps a single --email', () => {
  const args = parseImportArgs(['--email', 'grobrien@gmail.com']);
  assert.deepEqual(args.emails, ['grobrien@gmail.com']);
  assert.equal(args.apply, false);
  assert.equal(args.force, false);
  assert.equal(args.authOnly, false);
});

test('parseImportArgs accepts repeated --email flags and a comma list', () => {
  const args = parseImportArgs([
    '--email',
    'iammorgancrawford@gmail.com',
    '--email',
    'joebieker@gmail.com',
    '--apply',
    '--force'
  ]);
  assert.deepEqual(args.emails, ['iammorgancrawford@gmail.com', 'joebieker@gmail.com']);
  assert.equal(args.apply, true);
  assert.equal(args.force, true);

  const commas = parseImportArgs(['--email', 'Morgan@Example.com, joebieker@gmail.com']);
  assert.deepEqual(commas.emails, ['morgan@example.com', 'joebieker@gmail.com']);
});

test('parseImportArgs rejects a missing email', () => {
  assert.throws(() => parseImportArgs([]), /--email/);
  assert.throws(() => parseImportArgs(['--email', 'not-an-email']), /Invalid email/);
});

test('accountAction refreshes an existing email and creates a new one', () => {
  assert.equal(accountAction(false), 'create');
  assert.equal(accountAction(true), 'refresh');
});

test('current plan titles omit the client name', () => {
  assert.equal(currentPlanTitle('Morgan Crawford', 'meals', '2026-08-26'), 'Current meals (2026-08-26)');
  assert.equal(currentPlanTitle('Joe B', 'workouts', '2026-08-28'), 'Current workouts (2026-08-28)');
  assert.equal(displayNameFromLegacy('Joe B', 'joebieker@gmail.com'), 'Joe B');
  assert.equal(currentPlanTitle('Gary', 'meals', '2024-05-01'), 'Current meals (2024-05-01)');
  assert.equal(currentPlanTitle('Rachel George', 'meals', '2026-07-13'), 'Current meals (2026-07-13)');
});

test('sessions and programs are kept as stored, including old dates and gapped session numbers', () => {
  const sessions = sessionsForUser(
    [
      { id: '12994', ownerId: '330', date: '2022-01-28', sessionNumber: 6 },
      { id: '13611', ownerId: '330', date: '2022-04-01', sessionNumber: 12 },
      { id: '22080', ownerId: '330', date: '2026-08-28', sessionNumber: 13 },
      { id: '21726', ownerId: '1051', date: '2026-04-29', sessionNumber: 1 }
    ],
    '330'
  );
  assert.deepEqual(sessions.map((session) => session.sessionNumber), [6, 12, 13]);

  const sessionIds = new Set(sessions.map((session) => session.id));
  const programs = programsForSessions(
    [
      { id: '12243', ownerId: '12994', date: '2022-01-28' },
      { id: '21037', ownerId: '22080', date: '2026-08-28' },
      { id: '936', ownerId: '1051', date: '2019-01-13' },
      { id: 'other', ownerId: '999', date: '2018-01-01' }
    ],
    sessionIds
  );
  assert.deepEqual(programs.map((program) => program.id), ['12243', '21037']);
});

test('nutrition 936 stays on session 1051 instead of user 1051', () => {
  const ownSessionIds = new Set(['21726', '22074']);
  const notes = foreignSessionPrograms({
    userId: '1051',
    ownSessionIds,
    candidates: [{ kind: 'nutrition', id: '936', date: '2019-01-13', ownerId: '1051' }],
    sessionOwnerById: new Map([
      ['1051', '125'],
      ['21726', '1051']
    ])
  });
  assert.equal(notes.length, 1);
  assert.equal(notes[0].id, '936');
  assert.equal(notes[0].sessionOwnerUserId, '125');
  assert.equal(programsForSessions([{ id: '936', ownerId: '1051' }], ownSessionIds).length, 0);
  assert.equal(
    programsForSessions(
      [
        { id: '21031', ownerId: '22074', date: '2026-08-26' },
        { id: '936', ownerId: '1051', date: '2019-01-13' }
      ],
      ownSessionIds
    ).map((program) => program.id).join(','),
    '21031'
  );
});
