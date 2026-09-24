// Emergency restore of Storage files from a backup-storage.mjs backup. Re-uploads
// each file to its original path, overwriting whatever's there now.
//
// Usage:
//   node restore-storage.mjs --service-account ./serviceAccountKey.json --in ./backups/<timestamp>/storage --apply
//
// Dry run by default (lists what it would restore).

import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { firebaseConfig } from '../js/firebase-config.js';

function parseArgs(argv) {
  const out = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--service-account') out.serviceAccount = argv[++i];
    else if (a === '--in') out.inDir = argv[++i];
  }
  return out;
}

function listFilesRecursive(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.serviceAccount || !args.inDir) {
    console.error('Usage: node restore-storage.mjs --service-account <key.json> --in <backup-storage-dir> [--apply]');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(readFileSync(args.serviceAccount, 'utf8'));
  initializeApp({ credential: cert(serviceAccount), storageBucket: firebaseConfig.storageBucket });
  const bucket = getStorage().bucket();

  const files = listFilesRecursive(args.inDir);
  console.log(args.apply ? 'APPLYING restore -- this OVERWRITES current files.' : 'DRY RUN (pass --apply to actually upload).');
  console.log(`${files.length} files found in ${args.inDir}\n`);

  for (const localPath of files) {
    const destPath = relative(args.inDir, localPath).split('\\').join('/'); // Windows path -> Storage path
    console.log(`  ${destPath}`);
    if (args.apply) await bucket.upload(localPath, { destination: destPath });
  }

  console.log('\nDone.' + (args.apply ? '' : ' Re-run with --apply to upload these files.'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
