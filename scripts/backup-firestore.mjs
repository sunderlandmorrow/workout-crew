// Dumps every document in every collection this app uses to local JSON files, so you
// have a restore point before running migrate-to-crews.mjs (or anything else risky).
//
// Usage:
//   cd scripts
//   npm install
//   node backup-firestore.mjs --service-account ./serviceAccountKey.json
//
// Writes to ./backups/<timestamp>/<collection>.json (one file per collection).
// NEVER commit the backups/ folder -- it's your friends' real data. It's already
// covered by scripts/.gitignore, but double check before you ever `git add -A`.

import { writeFileSync, mkdirSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const COLLECTIONS = ['crews', 'inviteCodes', 'members', 'workouts', 'messages', 'weights'];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--service-account') out.serviceAccount = argv[++i];
    if (argv[i] === '--out') out.out = argv[++i];
  }
  return out;
}

// Firestore Timestamps aren't plain JSON -- tag them so restore-firestore.mjs can rebuild them.
function serialize(value) {
  if (value instanceof Timestamp) return { __timestamp__: true, seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.serviceAccount) {
    console.error('Missing --service-account <path-to-key.json>.');
    process.exit(1);
  }
  const outDir = args.out || `./backups/${new Date().toISOString().replace(/[:.]/g, '-')}`;
  mkdirSync(outDir, { recursive: true });

  const { readFileSync } = await import('node:fs');
  const serviceAccount = JSON.parse(readFileSync(args.serviceAccount, 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  console.log(`Backing up into ${outDir}\n`);
  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get();
    const docs = snap.docs.map((d) => ({ id: d.id, data: serialize(d.data()) }));
    writeFileSync(`${outDir}/${name}.json`, JSON.stringify(docs, null, 2));
    console.log(`${name}: ${docs.length} docs`);
  }
  console.log(`\nDone. Keep ${outDir} somewhere safe (NOT in git) until you're confident the migration worked.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
