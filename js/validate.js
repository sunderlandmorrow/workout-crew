// Input checks that run in the browser before anything is sent to Firebase.
// The security rules enforce the important parts too; this just gives friendly errors.

export class ValidationError extends Error {}
const bad = (msg) => new ValidationError(msg);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function displayName(v) {
  if (typeof v !== 'string') throw bad('Please enter a name');
  const s = v.trim();
  if (s.length < 1 || s.length > 40) throw bad('Name must be 1-40 characters');
  return s;
}

export function chatMessage(v) {
  if (typeof v !== 'string') throw bad('Message cannot be empty');
  const s = v.trim();
  if (s.length < 1) throw bad('Message cannot be empty');
  if (s.length > 2000) throw bad('Message must be at most 2000 characters');
  return s;
}

export function inviteCode(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(s)) throw bad('Wrong group code');
  return s;
}

function optNumber(v, field, { min, max, integer }) {
  if (v === undefined || v === null || v === '') return null;
  let n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw bad(`${field} must be a number between ${min} and ${max}`);
  }
  if (integer) n = Math.round(n);
  return n;
}

function optText(v, field, max) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw bad(`${field} must be text`);
  const s = v.trim();
  if (s.length > max) throw bad(`${field} must be at most ${max} characters`);
  return s || null;
}

function exercises(v) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw bad('exercises must be a list');
  if (v.length > 50) throw bad('At most 50 exercises per workout');
  return v.map((e, i) => {
    const label = `Exercise ${i + 1}`;
    if (!e || typeof e !== 'object') throw bad(`${label} is invalid`);
    const name = optText(e.name, `${label} name`, 60);
    if (!name) throw bad(`${label} needs a name`);
    const unit = e.unit ?? null;
    if (unit !== null && unit !== 'lb' && unit !== 'kg') throw bad(`${label} unit must be lb or kg`);
    return {
      name,
      sets: optNumber(e.sets, `${label} sets`, { min: 0, max: 100, integer: true }),
      reps: optNumber(e.reps, `${label} reps`, { min: 0, max: 1000, integer: true }),
      weight: optNumber(e.weight, `${label} weight`, { min: 0, max: 5000 }),
      unit,
      distanceKm: optNumber(e.distanceKm, `${label} distance`, { min: 0, max: 1000 }),
      durationMin: optNumber(e.durationMin, `${label} minutes`, { min: 0, max: 1440 }),
    };
  });
}

// Returns only the fields that were provided (partial) or all fields (full).
export function workout(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object') throw bad('Missing workout details');
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);

  if (!partial || has('performedOn')) {
    if (!isDate(input.performedOn)) throw bad('Pick a valid date');
    out.performedOn = input.performedOn;
  }
  if (!partial || has('type')) {
    const t = optText(input.type, 'Workout type', 40);
    if (!t) throw bad('Workout type is required (e.g. run, lift)');
    out.type = t.toLowerCase();
  }
  if (!partial || has('durationMin')) {
    out.durationMin = optNumber(input.durationMin, 'Minutes', { min: 0, max: 1440, integer: true });
  }
  if (!partial || has('notes')) out.notes = optText(input.notes, 'Notes', 1000);
  if (!partial || has('exercises')) out.exercises = exercises(input.exercises);
  return out;
}
