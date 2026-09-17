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
