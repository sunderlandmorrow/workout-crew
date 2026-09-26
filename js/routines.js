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

// Structured Lift mode: generic proven exercise picks per muscle group, two
// variants (A/B) to alternate between. No entry for 'rest' or 'cardio' -- there's
// nothing to structure there, so those tags are just skipped when building a
// structured workout's exercise list.
export const WORKOUT_TEMPLATES = {
  chest: {
    A: [
      { name: 'Barbell Bench Press', sets: 4, reps: 8 },
      { name: 'Incline Dumbbell Press', sets: 3, reps: 10 },
      { name: 'Cable Fly', sets: 3, reps: 12 },
    ],
    B: [
      { name: 'Incline Barbell Press', sets: 4, reps: 8 },
      { name: 'Weighted Dip', sets: 3, reps: 10 },
      { name: 'Pec Deck', sets: 3, reps: 12 },
    ],
  },
  triceps: {
    A: [
      { name: 'Close-Grip Bench Press', sets: 4, reps: 8 },
      { name: 'Overhead Tricep Extension', sets: 3, reps: 10 },
      { name: 'Tricep Pushdown', sets: 3, reps: 12 },
    ],
    B: [
      { name: 'Skull Crushers', sets: 4, reps: 8 },
      { name: 'Single-Arm Overhead Extension', sets: 3, reps: 10 },
      { name: 'Rope Pushdown', sets: 3, reps: 12 },
    ],
  },
  back: {
    A: [
      { name: 'Deadlift', sets: 3, reps: 5 },
      { name: 'Pull-Up', sets: 4, reps: 8 },
      { name: 'Barbell Row', sets: 3, reps: 10 },
    ],
    B: [
      { name: 'Lat Pulldown', sets: 4, reps: 10 },
      { name: 'Seated Cable Row', sets: 3, reps: 10 },
      { name: 'T-Bar Row', sets: 3, reps: 10 },
    ],
  },
  biceps: {
    A: [
      { name: 'Barbell Curl', sets: 4, reps: 8 },
      { name: 'Hammer Curl', sets: 3, reps: 10 },
    ],
    B: [
      { name: 'Incline Dumbbell Curl', sets: 4, reps: 10 },
      { name: 'Cable Curl', sets: 3, reps: 12 },
    ],
  },
  legs: {
    A: [
      { name: 'Back Squat', sets: 4, reps: 8 },
      { name: 'Romanian Deadlift', sets: 3, reps: 10 },
      { name: 'Leg Press', sets: 3, reps: 12 },
    ],
    B: [
      { name: 'Front Squat', sets: 4, reps: 8 },
      { name: 'Leg Curl', sets: 3, reps: 12 },
      { name: 'Walking Lunge', sets: 3, reps: 12 },
    ],
  },
  shoulders: {
    A: [
      { name: 'Overhead Press', sets: 4, reps: 8 },
      { name: 'Lateral Raise', sets: 3, reps: 12 },
      { name: 'Rear Delt Fly', sets: 3, reps: 12 },
    ],
    B: [
      { name: 'Arnold Press', sets: 4, reps: 10 },
      { name: 'Cable Lateral Raise', sets: 3, reps: 12 },
      { name: 'Face Pull', sets: 3, reps: 15 },
    ],
  },
  traps: {
    A: [{ name: 'Barbell Shrug', sets: 4, reps: 10 }],
    B: [{ name: 'Dumbbell Shrug', sets: 4, reps: 12 }],
  },
  abs: {
    A: [
      { name: 'Hanging Leg Raise', sets: 3, reps: 12 },
      { name: 'Cable Crunch', sets: 3, reps: 15 },
    ],
    B: [
      { name: 'Weighted Sit-Up', sets: 3, reps: 15 },
      { name: 'Ab Wheel Rollout', sets: 3, reps: 10 },
    ],
  },
};

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
