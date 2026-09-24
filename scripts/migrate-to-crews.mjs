// One-time migration: backfills the existing (pre-crews) data with a crewId so it
// keeps working once the multi-crew rules/frontend are deployed.
//
// Uses the Firebase Admin SDK, which bypasses security rules entirely -- that's
// required here because the old firestore.rules has no concept of crewId, so a
// normal signed-in client could never write it onto existing docs.
//
// Usage:
//   cd scripts
//   npm install
//   node migrate-to-crews.mjs --service-account ./serviceAccountKey.json --crew-id brothersandarms --crew-name "BrothersAndArms"
//
// Add --apply to actually write. Without it, this only prints what it WOULD do.
//
// Get the service account key from:
//   Firebase console -> Project settings (gear icon) -> Service accounts -> Generate new private key
// Keep that file out of git (scripts/.gitignore already excludes serviceAccountKey*.json).

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function parseArgs(argv) {
  const out = { apply: false, crewId: 'brothersandarms', crewName: 'BrothersAndArms', competitionDate: '2028-09-16' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--service-account') out.serviceAccount = argv[++i];
    else if (a === '--crew-id') out.crewId = argv[++i];
    else if (a === '--crew-name') out.crewName = argv[++i];
    else if (a === '--competition-date') out.competitionDate = argv[++i];
  }
  return out;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 confusion
function randomSuffix(length = 8) {
  let s = '';
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.serviceAccount) {
    console.error('Missing --service-account <path-to-key.json>. See the comment at the top of this file.');
    process.exit(1);
  }
  if (!/^[a-z0-9-]{2,40}$/.test(args.crewId)) {
    console.error('--crew-id must be lowercase letters/digits/hyphens, 2-40 chars (e.g. "brothersandarms").');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(readFileSync(args.serviceAccount, 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  console.log(args.apply ? 'APPLYING changes.' : 'DRY RUN (pass --apply to actually write).');
  console.log(`Crew: id="${args.crewId}" name="${args.crewName}" competitionDate="${args.competitionDate}"\n`);

  // 1. Create the crew doc, if it doesn't already exist.
  const crewRef = db.collection('crews').doc(args.crewId);
  const crewSnap = await crewRef.get();
  if (crewSnap.exists) {
    console.log(`crews/${args.crewId} already exists, leaving it alone.`);
  } else {
    console.log(`Will create crews/${args.crewId} { name, competitionDate, createdAt }`);
    if (args.apply) {
      await crewRef.set({ name: args.crewName, competitionDate: args.competitionDate, createdAt: FieldValue.serverTimestamp() });
    }
  }

  // 2. Create one invite code for this crew, so you have something to hand out
  //    for anyone who joins later. Existing members below get crewId set directly,
  //    they don't need this code.
  const code = `${args.crewId}_${randomSuffix()}`;
  console.log(`Will create inviteCodes/${code} { crewId: "${args.crewId}" } -- SAVE THIS CODE, it's shown once:`);
  console.log(`  ${code}`);
  if (args.apply) {
    await db.collection('inviteCodes').doc(code).set({ crewId: args.crewId, createdAt: FieldValue.serverTimestamp() });
  }

  // 3. Backfill crewId onto every existing doc that doesn't have one yet.
  for (const collectionName of ['members', 'workouts', 'messages', 'weights']) {
    const snap = await db.collection(collectionName).get();
    const toUpdate = snap.docs.filter((d) => !('crewId' in d.data()));
    console.log(`${collectionName}: ${snap.size} total, ${toUpdate.length} missing crewId`);
    if (!args.apply || toUpdate.length === 0) continue;

    // Firestore batches cap at 500 writes.
    for (let i = 0; i < toUpdate.length; i += 400) {
      const batch = db.batch();
      for (const docSnap of toUpdate.slice(i, i + 400)) {
        batch.update(docSnap.ref, { crewId: args.crewId });
      }
      await batch.commit();
    }
    console.log(`  -> updated ${toUpdate.length} ${collectionName} docs`);
  }

  console.log('\nDone.' + (args.apply ? '' : ' Re-run with --apply to write these changes.'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
