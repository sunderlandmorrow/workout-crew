// Sets (or clears) the optional `color` field on a member's profile, matched by
// the first word of their display name (case-insensitive) -- e.g. "Sonny" matches
// a member named "Sonny" or "Sonny K.". Errors out if that matches 0 or 2+ members,
// so you don't accidentally recolor the wrong person.
//
// Usage:
//   node set-member-color.mjs --service-account ./serviceAccountKey.json --name sonny --color "#e0b400" --apply
//   node set-member-color.mjs --service-account ./serviceAccountKey.json --name sonny --clear --apply

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function parseArgs(argv) {
  const out = { apply: false, clear: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--clear') out.clear = true;
    else if (a === '--service-account') out.serviceAccount = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--color') out.color = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.serviceAccount || !args.name || (!args.color && !args.clear)) {
    console.error('Usage: node set-member-color.mjs --service-account <key.json> --name <first name> (--color "#rrggbb" | --clear) [--apply]');
    process.exit(1);
  }

  const serviceAccount = JSON.parse(readFileSync(args.serviceAccount, 'utf8'));
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const snap = await db.collection('members').get();
  const target = args.name.toLowerCase();
  const matches = snap.docs.filter((d) => {
    const first = String(d.data().displayName || '').trim().split(/\s+/)[0]?.toLowerCase();
    return first === target;
  });

  if (matches.length === 0) {
    console.error(`No member found whose first name is "${args.name}".`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`${matches.length} members match "${args.name}" -- be more specific or edit by hand in the console:`);
    matches.forEach((d) => console.error(`  ${d.id}: ${d.data().displayName}`));
    process.exit(1);
  }

  const doc = matches[0];
  console.log(`Matched ${doc.id}: "${doc.data().displayName}"`);
  console.log(args.clear ? 'Will clear color field.' : `Will set color = "${args.color}"`);

  if (!args.apply) {
    console.log('\nDry run -- re-run with --apply to write this change.');
    return;
  }

  const { FieldValue } = await import('firebase-admin/firestore');
  await doc.ref.update({ color: args.clear ? FieldValue.delete() : args.color });
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
