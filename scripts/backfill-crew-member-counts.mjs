// Recomputes and saves memberCount on every crews/{crewId} doc, from the actual
// members collection. Useful right after the "Workout Crews" browse tab shipped
// (existing crews have no memberCount yet), or any time you want to force-resync
// all of them at once instead of waiting for each crew's own members to trigger
// api.refreshCrewMemberCount() by using the app.
//
// Usage:
//   cd scripts
//   npm install
//   node backfill-crew-member-counts.mjs --service-account ./serviceAccountKey.json --apply

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
    console.error('Usage: node backfill-crew-member-counts.mjs --service-account <key.json> [--apply]');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(readFileSync(args.serviceAccount, 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  console.log(args.apply ? 'APPLYING changes.' : 'DRY RUN (pass --apply to actually write).\n');

  const [crewsSnap, membersSnap] = await Promise.all([
    db.collection('crews').get(),
    db.collection('members').get(),
  ]);

  const counts = {};
  membersSnap.forEach((d) => {
    const crewId = d.data().crewId;
    counts[crewId] = (counts[crewId] || 0) + 1;
  });

  for (const crewDoc of crewsSnap.docs) {
    const count = counts[crewDoc.id] || 0;
    console.log(`${crewDoc.id}: ${crewDoc.data().memberCount ?? '(unset)'} -> ${count}`);
    if (args.apply) await crewDoc.ref.update({ memberCount: count });
  }

  console.log('\nDone.' + (args.apply ? '' : ' Re-run with --apply to write these changes.'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
