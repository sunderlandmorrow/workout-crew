// Run with: node test/logic.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, computeStreaks, buildLeaderboard, makeSortKey } from '../js/stats.js';
import * as v from '../js/validate.js';

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('streaks', () => {
  const today = '2026-09-15';
  assert.deepEqual(computeStreaks([], today), { current: 0, best: 0 });
  assert.deepEqual(computeStreaks(['2026-09-15', '2026-09-14', '2026-09-13'], today), { current: 3, best: 3 });
  // yesterday still counts as alive
  assert.deepEqual(computeStreaks(['2026-09-14', '2026-09-13'], today), { current: 2, best: 2 });
  // two days ago breaks it
  assert.deepEqual(computeStreaks(['2026-09-13', '2026-09-12'], today), { current: 0, best: 2 });
  // best streak older than current
  assert.deepEqual(
    computeStreaks(['2026-09-15', '2026-09-10', '2026-09-09', '2026-09-08', '2026-09-07'], today),
    { current: 1, best: 4 });
});

test('sortKey sorts newest first and matches date ranges', () => {
  const a = makeSortKey('2026-09-14', '2026-09-15T10:00:00.000Z');
  const b = makeSortKey('2026-09-15', '2026-09-15T09:00:00.000Z');
  const c = makeSortKey('2026-09-15', '2026-09-15T11:00:00.000Z');
  assert.deepEqual([a, c, b].sort().reverse(), [c, b, a]);
  assert.ok(b >= '2026-09-15' && b < '2026-09-16');
  assert.ok(!(a >= '2026-09-15'));
  assert.equal(b.split('_')[0], '2026-09-15'); // what the security rule checks
});

test('leaderboard', () => {
  const members = [
    { id: 'a', displayName: 'Alex' },
    { id: 'b', displayName: 'Bea' },
    { id: 'c', displayName: 'Cy' },
  ];
  const workouts = [
    { userId: 'a', performedOn: '2026-09-15', durationMin: 30 },
    { userId: 'a', performedOn: '2026-09-15', durationMin: 20 }, // same day twice
    { userId: 'a', performedOn: '2026-09-01', durationMin: 60 }, // outside 7-day window
    { userId: 'b', performedOn: '2026-09-14', durationMin: null },
    { userId: 'b', performedOn: '2026-09-13', durationMin: 45 },
    { userId: 'b', performedOn: '2026-09-20', durationMin: 45 }, // future: ignored
    { userId: 'zz', performedOn: '2026-09-15', durationMin: 10 }, // unknown member: ignored
  ];
  const { range, leaderboard } = buildLeaderboard(members, workouts, { today: '2026-09-15', days: 7 });
  assert.deepEqual(range, { from: '2026-09-09', to: '2026-09-15', days: 7 });
  assert.deepEqual(leaderboard.map((r) => r.user.id), ['b', 'a', 'c']);
  const [b, a, c] = leaderboard;
  assert.equal(b.activeDays, 2); assert.equal(b.workouts, 2); assert.equal(b.minutes, 45);
  assert.deepEqual(b.streak, { current: 2, best: 2 });
  assert.equal(b.lastWorkoutOn, '2026-09-14');
  assert.equal(a.activeDays, 1); assert.equal(a.workouts, 2); assert.equal(a.minutes, 50);
  assert.equal(a.lastWorkoutOn, '2026-09-15');
  assert.equal(c.workouts, 0); assert.equal(c.lastWorkoutOn, null);
});

test('workout validation', () => {
  const w = v.workout({
    performedOn: '2026-09-15', type: '  Lift ', durationMin: '45.4', notes: '  leg day ', rating: '4',
    exercises: [{ name: 'Squat', sets: 5, reps: 5, weight: 225, unit: 'lb' }],
  });
  assert.equal(w.type, 'lift');
  assert.equal(w.durationMin, 45); // rounded: rules require an integer
  assert.equal(w.notes, 'leg day');
  assert.equal(w.rating, 4);
  assert.equal(v.workout({ performedOn: '2026-09-15', type: 'run' }).rating, null);
  assert.throws(() => v.workout({ performedOn: '2026-09-15', type: 'run', rating: 6 }), /Rating/);
  assert.deepEqual(w.exercises[0], {
    name: 'Squat', sets: 5, reps: 5, weight: 225, unit: 'lb', distanceKm: null, durationMin: null,
  });
  assert.equal(v.workout({ performedOn: '2026-09-15', type: 'run' }).durationMin, null);

  assert.throws(() => v.workout({ performedOn: '2026-02-30', type: 'run' }), /date/);
  assert.throws(() => v.workout({ performedOn: '2026-09-15', type: '' }), /type/);
  assert.throws(() => v.workout({ performedOn: '2026-09-15', type: 'run', durationMin: 2000 }), /Minutes/);
  assert.throws(() => v.workout({ performedOn: '2026-09-15', type: 'run', exercises: [{ sets: 3 }] }), /name/);
  assert.throws(() => v.workout({ performedOn: '2026-09-15', type: 'run', exercises: [{ name: 'x', unit: 'st' }] }), /unit/);

  // partial updates only return what was sent
  assert.deepEqual(v.workout({ notes: 'edited' }, { partial: true }), { notes: 'edited' });
});

test('names and invite codes', () => {
  assert.equal(v.displayName('  Sam '), 'Sam');
  assert.throws(() => v.displayName('   '));
  assert.throws(() => v.displayName('x'.repeat(41)));
  assert.equal(v.inviteCode(' lift-crew-8431 '), 'lift-crew-8431');
  assert.throws(() => v.inviteCode('abc'));          // too short
  assert.throws(() => v.inviteCode('bad/code!!'));   // would break the rules path
});
