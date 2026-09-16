// Muscle-group / routine presets for the check-in form.
// type values encode as "<groupId>" (rest) or "<groupId>:<a|b>" so no Firestore
// schema change is needed -- it's just stored in the existing workout `type` field.

export const MUSCLE_GROUPS = [
  { id: 'chest-tris', label: 'Chest / Tris' },
  { id: 'back-bis', label: 'Back / Bis' },
  { id: 'legs', label: 'Legs' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'full-body', label: 'Full Body' },
  { id: 'rest', label: 'Rest' },
];

// Placeholder routines for everything but Chest/Tris -- swap these for the real ones.
export const ROUTINES = {
  'chest-tris': {
    a: ['Barbell Bench Press', 'Incline Dumbbell Press', 'Cable Fly', 'Tricep Pushdown', 'Overhead Tricep Extension'],
    b: ['Dumbbell Bench Press', 'Incline Machine Press', 'Pec Deck', 'Close Grip Bench Press', 'Skull Crushers'],
  },
  'back-bis': {
    a: ['Deadlift', 'Pull-Up', 'Barbell Row', 'Barbell Curl', 'Hammer Curl'],
    b: ['Lat Pulldown', 'Seated Cable Row', 'Chest-Supported Row', 'Preacher Curl', 'Cable Curl'],
  },
  legs: {
    a: ['Barbell Squat', 'Romanian Deadlift', 'Leg Press', 'Walking Lunge', 'Calf Raise'],
    b: ['Front Squat', 'Leg Curl', 'Leg Extension', 'Bulgarian Split Squat', 'Seated Calf Raise'],
  },
  shoulders: {
    a: ['Overhead Press', 'Lateral Raise', 'Face Pull', 'Rear Delt Fly', 'Front Raise'],
    b: ['Arnold Press', 'Cable Lateral Raise', 'Upright Row', 'Reverse Pec Deck', 'Shrugs'],
  },
  'full-body': {
    a: ['Deadlift', 'Push-Up', 'Barbell Row', 'Goblet Squat', 'Plank'],
    b: ['Kettlebell Swing', 'Pull-Up', 'Overhead Press', 'Walking Lunge', 'Mountain Climbers'],
  },
};

export function typeFor(groupId, routineKey) {
  return routineKey ? `${groupId}:${routineKey}` : groupId;
}

export function parseType(type) {
  const [groupId, routineKey] = String(type || '').split(':');
  const group = MUSCLE_GROUPS.find((g) => g.id === groupId);
  return {
    groupLabel: group ? group.label : (groupId || 'Workout'),
    routineLabel: routineKey ? `Routine ${routineKey.toUpperCase()}` : null,
  };
}
