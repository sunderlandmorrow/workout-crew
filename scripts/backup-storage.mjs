// Downloads every file in Firebase Storage (avatars, chat photos, progress photos) to
// local disk, preserving folder structure. These are your friends' actual photos --
// there's no text-based way to reconstruct them, so this matters more than the
// Firestore backup for anything irreplaceable.
//
// Usage:
//   cd scripts
//   npm install
//   node backup-storage.mjs --service-account ./serviceAccountKey.json
//
// Writes to ./backups/<timestamp>/storage/<original path>. Requires the Blaze plan
// (same as the app's chat/progress photos feature) -- if you never turned on Storage,
// this will just report 0 files and that's fine.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { firebaseConfig } from '../js/firebase-config.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--service-account') out.serviceAccount = argv[++i];
    if (argv[i] === '--out') out.out = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.serviceAccount) {
    console.error('Missing --service-account <path-to-key.json>.');
    process.exit(1);
  }
  const outDir = args.out || `./backups/${new Date().toISOString().replace(/[:.]/g, '-')}/storage`;
  mkdirSync(outDir, { recursive: true });

  const serviceAccount = JSON.parse(readFileSync(args.serviceAccount, 'utf8'));
  initializeApp({ credential: cert(serviceAccount), storageBucket: firebaseConfig.storageBucket });
  const bucket = getStorage().bucket();

  console.log(`Backing up Storage into ${outDir}\n`);
  const [files] = await bucket.getFiles();
  if (!files.length) {
    console.log('No files found (Storage may not be turned on for this project -- that\'s fine).');
    return;
  }
  for (const file of files) {
    const destPath = `${outDir}/${file.name}`;
    mkdirSync(dirname(destPath), { recursive: true });
    await file.download({ destination: destPath });
    console.log(`  ${file.name}`);
  }
  console.log(`\nDone. ${files.length} files backed up. Keep ${outDir} somewhere safe (NOT in git).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
