// Muscle tags for the check-in form. Multi-select: type is stored as a
// comma-joined list of tag ids (e.g. "chest,triceps") in the existing
// workout `type` field -- no Firestore schema change needed.

export const MUSCLE_TAGS = [
  { id: 'chest', label: 'Chest' },
  { id: 'triceps', label: 'Triceps' },
  { id: 'back', label: 'Back' },
  { id: 'biceps', label: 'Biceps' },
  { id: 'legs', label: 'Legs' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'traps', label: 'Traps' },
  { id: 'abs', label: 'Abs' },
  { id: 'cardio', label: 'Cardio' },
  { id: 'rest', label: 'Rest' },
];

const LABEL_BY_ID = Object.fromEntries(MUSCLE_TAGS.map((t) => [t.id, t.label]));

export function tagsToType(tagIds) {
  return tagIds.join(',');
}

export function parseType(type) {
  const ids = String(type || '').split(',').filter(Boolean);
  if (!ids.length) return { label: 'Workout' };
  return { label: ids.map((id) => LABEL_BY_ID[id] || id).join(' + ') };
}

// Structured Lift mode: a generic 4-day split. Each "day" is really just a
// preset combination of MUSCLE_TAGS -- picking one sets the same selectedTags
// a freeform pick would, so everything downstream (type string, templates,
// exercises) works unchanged.
export const SPLIT_DAYS = [
  { id: 'legs-day', label: 'Legs', tags: ['legs'] },
  { id: 'chest-triceps-day', label: 'Chest & Triceps', tags: ['chest', 'triceps'] },
  { id: 'back-biceps-day', label: 'Back & Biceps', tags: ['back', 'biceps'] },
  { id: 'shoulders-biceps-day', label: 'Shoulders & Biceps', tags: ['shoulders', 'biceps'] },
];

// Structured Lift mode: placeholder exercise picks per muscle group, two
// variants (A/B) to alternate between. No entry for 'rest' or 'cardio' -- there's
// nothing to structure there, so those tags are just skipped when building a
// structured workout's exercise list.
// Every muscle group gets 4 placeholder exercises per variant, 4 sets each --
// swap "Exercise 1" etc. for real names/sets/reps whenever you're ready.
function placeholderExercises(label) {
  return [1, 2, 3, 4].map((n) => ({ name: `${label} Exercise ${n}`, sets: 4 }));
}

const TEMPLATED_GROUPS = ['chest', 'triceps', 'back', 'biceps', 'legs', 'shoulders', 'traps', 'abs'];
export const WORKOUT_TEMPLATES = Object.fromEntries(
  TEMPLATED_GROUPS.map((id) => {
    const label = LABEL_BY_ID[id];
    return [id, { A: placeholderExercises(label), B: placeholderExercises(label) }];
  })
);

/** True if any selected tag has a structured-mode template (i.e. an A/B choice makes sense). */
export function hasTemplates(tagIds) {
  return tagIds.some((id) => WORKOUT_TEMPLATES[id]);
}

/** Merges the A or B exercise list for every selected tag that has a template. */
export function buildStructuredExercises(tagIds, variant) {
  return tagIds
    .filter((id) => WORKOUT_TEMPLATES[id])
    .flatMap((id) => WORKOUT_TEMPLATES[id][variant]);
}
