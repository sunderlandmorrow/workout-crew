// Exports the list of Firebase Authentication accounts (uid, email, disabled state,
// creation/last-login time) to a local JSON file.
//
// IMPORTANT LIMITATION: this does NOT include password hashes -- the Admin SDK's
// listUsers() doesn't expose them. This backup is an inventory (know who has an
// account, spot anything unexpected) and lets you re-create disabled/email/uid state,
// but it can't restore anyone's ability to log in with their existing password; a
// restore from this would need everyone to use "Forgot password" again.
//
// If you want a backup that CAN restore logins exactly (password hashes included),
// use the official Firebase CLI instead, which supports it directly:
//   npm install -g firebase-tools
//   firebase login
//   firebase auth:export users.json --project <your-project-id>
// (That needs an interactive browser login, which is why this script uses the
// simpler Admin SDK path instead.)
//
// Usage:
//   cd scripts
//   npm install
//   node backup-auth.mjs --service-account ./serviceAccountKey.json

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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
  const outDir = args.out || `./backups/${new Date().toISOString().replace(/[:.]/g, '-')}`;
  mkdirSync(outDir, { recursive: true });

  const serviceAccount = JSON.parse(readFileSync(args.serviceAccount, 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
  const auth = getAuth();

  const users = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    for (const u of result.users) {
      users.push({
        uid: u.uid,
        email: u.email,
        emailVerified: u.emailVerified,
        disabled: u.disabled,
        createdAt: u.metadata.creationTime,
        lastSignInAt: u.metadata.lastSignInTime,
      });
    }
    pageToken = result.pageToken;
  } while (pageToken);

  writeFileSync(`${outDir}/auth-users.json`, JSON.stringify(users, null, 2));
  console.log(`auth-users: ${users.length} accounts -> ${outDir}/auth-users.json`);
  console.log('(No password hashes -- see the note at the top of this file if you need full login recovery.)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
