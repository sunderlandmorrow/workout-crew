// Emergency restore from a backup made by backup-firestore.mjs. Overwrites documents
// in Firestore with what's in the backup files (same id = replaced entirely).
//
// Usage:
//   node restore-firestore.mjs --service-account ./serviceAccountKey.json --in ./backups/2026-09-24T12-00-00-000Z
//
// Dry run by default (prints what it would restore). Add --apply to actually write.
// Add --collections members,workouts to restore only specific collections
// (default: all files found in the backup folder).

import { readFileSync, readdirSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

function parseArgs(argv) {
  const out = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--service-account') out.serviceAccount = argv[++i];
    else if (a === '--in') out.inDir = argv[++i];
    else if (a === '--collections') out.collections = argv[++i].split(',').map((s) => s.trim());
  }
  return out;
}

function deserialize(value) {
  if (value && typeof value === 'object' && value.__timestamp__) {
    return new Timestamp(value.seconds, value.nanoseconds);
  }
  if (Array.isArray(value)) return value.map(deserialize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deserialize(v)]));
  }
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.serviceAccount || !args.inDir) {
    console.error('Usage: node restore-firestore.mjs --service-account <key.json> --in <backup-dir> [--apply] [--collections a,b]');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(readFileSync(args.serviceAccount, 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const files = readdirSync(args.inDir).filter((f) => f.endsWith('.json'));
  const collections = args.collections || files.map((f) => f.replace(/\.json$/, ''));

  console.log(args.apply ? 'APPLYING restore -- this OVERWRITES current data.' : 'DRY RUN (pass --apply to actually write).');
  console.log(`From: ${args.inDir}\n`);

  for (const name of collections) {
    const file = `${args.inDir}/${name}.json`;
    let docs;
    try {
      docs = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      console.log(`${name}: no backup file found, skipping`);
      continue;
    }
    console.log(`${name}: ${docs.length} docs to restore`);
    if (!args.apply) continue;

    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      for (const { id, data } of docs.slice(i, i + 400)) {
        batch.set(db.collection(name).doc(id), deserialize(data));
      }
      await batch.commit();
    }
    console.log(`  -> restored ${docs.length} ${name} docs`);
  }

  console.log('\nDone.' + (args.apply ? '' : ' Re-run with --apply to write these changes.'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
