// Date helpers and leaderboard math. No Firebase here, so it's easy to test.
// All dates are plain 'YYYY-MM-DD' strings in the phone's local timezone.

export function addDays(date, n) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function localToday(now = new Date()) {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Workout ordering key: date first, then creation time, so plain string sorting
// gives newest-first order and date-range queries work on one field.
export function makeSortKey(performedOn, createdIso = new Date().toISOString()) {
  return `${performedOn}_${createdIso}`;
}

// datesDesc: distinct workout dates, newest first.
// A current streak is alive if the latest workout was today or yesterday.
export function computeStreaks(datesDesc, today) {
  let best = 0, run = 0, prev = null;
  for (const d of datesDesc) {
    run = prev && addDays(d, 1) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  let current = 0;
  if (datesDesc.length && (datesDesc[0] === today || datesDesc[0] === addDays(today, -1))) {
    current = 1;
    while (current < datesDesc.length && addDays(datesDesc[current], 1) === datesDesc[current - 1]) {
      current++;
    }
  }
  return { current, best };
}

// members: [{id, displayName}]
// workouts: [{userId, performedOn, durationMin}] covering at least [historyFrom, today]
export function buildLeaderboard(members, workouts, { today, days }) {
  const from = addDays(today, -(days - 1));
  const byUser = new Map(members.map((m) => [m.id, {
    user: { id: m.id, displayName: m.displayName },
    workouts: 0, minutes: 0, activeDays: 0,
    streak: { current: 0, best: 0 },
    lastWorkoutOn: null,
    _allDates: new Set(), _windowDates: new Set(),
  }]));

  for (const w of workouts) {
    const row = byUser.get(w.userId);
    if (!row || w.performedOn > today) continue; // future-dated entries don't count yet
    row._allDates.add(w.performedOn);
    if (!row.lastWorkoutOn || w.performedOn > row.lastWorkoutOn) row.lastWorkoutOn = w.performedOn;
    if (w.performedOn >= from) {
      row.workouts += 1;
      row.minutes += w.durationMin || 0;
      row._windowDates.add(w.performedOn);
    }
  }

  const rows = [...byUser.values()].map(({ _allDates, _windowDates, ...row }) => ({
    ...row,
    activeDays: _windowDates.size,
    streak: computeStreaks([..._allDates].sort().reverse(), today),
  }));

  rows.sort((a, b) =>
    b.activeDays - a.activeDays ||
    b.workouts - a.workouts ||
    b.minutes - a.minutes ||
    a.user.displayName.localeCompare(b.user.displayName));

  return { range: { from, to: today, days }, leaderboard: rows };
}
