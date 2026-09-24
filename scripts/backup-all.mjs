// Runs backup-firestore.mjs, backup-storage.mjs, and backup-auth.mjs together,
// into one shared timestamped folder. Recommended: run this before doing anything
// risky (migrations, rules changes, bulk edits).
//
// Usage:
//   cd scripts
//   npm install
//   node backup-all.mjs --service-account ./serviceAccountKey.json

import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptsDir = fileURLToPath(new URL('.', import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--service-account') out.serviceAccount = argv[++i];
  }
  return out;
}

function run(script, args) {
  console.log(`\n=== ${script} ===`);
  execFileSync(process.execPath, [script, ...args], { cwd: scriptsDir, stdio: 'inherit' });
}

const args = parseArgs(process.argv.slice(2));
if (!args.serviceAccount) {
  console.error('Missing --service-account <path-to-key.json>.');
  process.exit(1);
}

const outDir = `./backups/${new Date().toISOString().replace(/[:.]/g, '-')}`;
mkdirSync(`${scriptsDir}/${outDir}`, { recursive: true });

run('backup-firestore.mjs', ['--service-account', args.serviceAccount, '--out', outDir]);
run('backup-storage.mjs', ['--service-account', args.serviceAccount, '--out', `${outDir}/storage`]);
run('backup-auth.mjs', ['--service-account', args.serviceAccount, '--out', outDir]);

console.log(`\nAll backups complete: ${outDir}`);
