// Recomputes and saves memberCount, memberNames, and totalPoints on every
// crews/{crewId} doc, from the actual members/workouts collections. Useful right
// after the "Workout Crews" browse tab shipped (existing crews have none of these
// fields yet), or any time you want to force-resync all of them at once instead
// of waiting for each crew's own members to trigger api.refreshCrewStats() by
// using the app.
//
// Points formula must match js/stats.js's totalPoints(): 10 per logged workout,
// rest days don't count.
//
// Usage:
//   cd scripts
//   npm install
//   node backfill-crew-stats.mjs --service-account ./serviceAccountKey.json --apply

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const POINTS_PER_WORKOUT = 10;

function parseArgs(argv) {
  const out = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--service-account') out.serviceAccount = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.serviceAccount) {
    console.error('Usage: node backfill-crew-stats.mjs --service-account <key.json> [--apply]');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(readFileSync(args.serviceAccount, 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  console.log(args.apply ? 'APPLYING changes.' : 'DRY RUN (pass --apply to actually write).\n');

  const [crewsSnap, membersSnap, workoutsSnap] = await Promise.all([
    db.collection('crews').get(),
    db.collection('members').get(),
    db.collection('workouts').get(),
  ]);

  const memberCounts = {};
  const memberNames = {};
  membersSnap.forEach((d) => {
    const { crewId, displayName } = d.data();
    memberCounts[crewId] = (memberCounts[crewId] || 0) + 1;
    (memberNames[crewId] ??= []).push(displayName);
  });
  Object.values(memberNames).forEach((names) => names.sort());

  const points = {};
  workoutsSnap.forEach((d) => {
    const w = d.data();
    if (w.type === 'rest') return;
    points[w.crewId] = (points[w.crewId] || 0) + POINTS_PER_WORKOUT;
  });

  for (const crewDoc of crewsSnap.docs) {
    const memberCount = memberCounts[crewDoc.id] || 0;
    const names = memberNames[crewDoc.id] || [];
    const totalPoints = points[crewDoc.id] || 0;
    const before = crewDoc.data();
    console.log(`${crewDoc.id}: memberCount ${before.memberCount ?? '(unset)'} -> ${memberCount}, `
      + `memberNames ${JSON.stringify(before.memberNames ?? null)} -> ${JSON.stringify(names)}, `
      + `totalPoints ${before.totalPoints ?? '(unset)'} -> ${totalPoints}`);
    if (args.apply) await crewDoc.ref.update({ memberCount, memberNames: names, totalPoints });
  }

  console.log('\nDone.' + (args.apply ? '' : ' Re-run with --apply to write these changes.'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
