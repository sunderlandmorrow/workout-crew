// Creates a new, empty, fully isolated crew: a crews/{crewId} doc plus one
// inviteCodes/{crewId}_<random> doc pointing to it. Prints the invite code to hand out.
//
// This is the "add another group" tool -- for the one-time backfill of data that
// predates crews, use migrate-to-crews.mjs instead.
//
// Usage:
//   cd scripts
//   npm install
//   node create-crew.mjs --service-account ./serviceAccountKey.json --crew-id ironclub --crew-name "Iron Club"
//
// Add --apply to actually write (dry run by default).
// Add --competition-date YYYY-MM-DD to set a countdown; omit it and the app just
// won't show one for this crew.
//
// Get the service account key from:
//   Firebase console -> Project settings (gear icon) -> Service accounts -> Generate new private key
// Keep it out of git -- scripts/.gitignore already excludes serviceAccountKey*.json.
// Delete it again once you're done; there's no need to keep an admin credential around
// between the occasional times you add a crew.

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function parseArgs(argv) {
  const out = { apply: false };
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
  if (!args.serviceAccount || !args.crewId || !args.crewName) {
    console.error('Usage: node create-crew.mjs --service-account <key.json> --crew-id <slug> --crew-name "<Name>" [--competition-date YYYY-MM-DD] [--apply]');
    process.exit(1);
  }
  if (!/^[a-z0-9-]{2,40}$/.test(args.crewId)) {
    console.error('--crew-id must be lowercase letters/digits/hyphens, 2-40 chars (e.g. "ironclub").');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(readFileSync(args.serviceAccount, 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  console.log(args.apply ? 'APPLYING changes.' : 'DRY RUN (pass --apply to actually write).');

  const crewRef = db.collection('crews').doc(args.crewId);
  const crewSnap = await crewRef.get();
  if (crewSnap.exists) {
    console.error(`crews/${args.crewId} already exists -- pick a different --crew-id, or use this one's existing invite code.`);
    process.exit(1);
  }

  const crewDoc = { name: args.crewName, createdAt: FieldValue.serverTimestamp() };
  if (args.competitionDate) crewDoc.competitionDate = args.competitionDate;
  console.log(`Will create crews/${args.crewId}`, crewDoc);

  const code = `${args.crewId}_${randomSuffix()}`;
  console.log(`Will create inviteCodes/${code} { crewId: "${args.crewId}" }`);

  if (args.apply) {
    await crewRef.set(crewDoc);
    await db.collection('inviteCodes').doc(code).set({ crewId: args.crewId, createdAt: FieldValue.serverTimestamp() });
    console.log('\nDone. Hand out this code to whoever should join this crew:');
    console.log(`  ${code}`);
  } else {
    console.log('\nRe-run with --apply to write these changes.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
