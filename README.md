# Workout Crew

A tiny workout tracker for a group of friends. It's a plain website hosted free on
**GitHub Pages**, with **Firebase** (free Spark plan, no credit card) storing the data
and handling logins. Save it to your iPhone home screen and it behaves like an app.

## How it fits together

```
iPhone home-screen icon
        │
        ▼
GitHub Pages  ──  serves index.html, js/, icons/ (static files only)
        │
        ▼
Firebase      ──  Authentication (email + password)
                  Firestore database (members, workouts)
                  Security rules = the backend (who can do what)
```

The database can host **several isolated crews** at once (e.g. one for you and your
friends, a separate one for a different group) -- each crew only ever sees its own
members, workouts, chat, and weigh-ins. A crew is just a `crews/{crewId}` document
you create by hand in the console; which crew someone joins is encoded in the invite
code they sign up with (`<crewId>_<random suffix>`, e.g. `brothersandarms_X7K2M9`).

| File | What it is |
|---|---|
| `firestore.rules` | The backend logic. Only people with a valid invite code can join, and only into the crew that code belongs to; you can only see/edit your own crew's data; you can only edit your own workouts; anyone in a crew can give kudos or read/post to that crew's chat. |
| `firestore.indexes.json` | Database indexes the crew-scoped feed/members/chat/weights queries need. |
| `storage.rules` | Backend logic for chat photos. Requires the Blaze plan (Cloud Storage isn't available on Spark for new projects) -- see setup step 3b. |
| `js/api.js` | Data layer. The GUI calls this and never touches Firebase directly. |
| `js/firebase-config.js` | Your project's Firebase keys (you paste these in). |
| `js/stats.js`, `js/validate.js` | Leaderboard/streak math and input checks. |
| `index.html`, `manifest.webmanifest`, `sw.js`, `icons/` | Blank app shell, set up for "Add to Home Screen". |
| `test/logic.test.mjs` | Tests for streaks, leaderboard, validation: `node test/logic.test.mjs` |

---

## Setup (about 20 minutes, once)

### 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and click **Create a project**. Analytics isn't needed.
2. Leave it on the free **Spark** plan. Don't upgrade; on Spark you can never be charged,
   Firebase just pauses writes for the day if you somehow hit the limits.

### 2. Turn on logins

1. **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**.

### 3. Create the database

1. **Build → Firestore Database → Create database**.
2. Choose a location near you (for example `us-west1`). This can't be changed later.
3. Start in **production mode**.
4. Open the **Rules** tab, replace everything with the contents of `firestore.rules`, and click **Publish**.
5. Open the **Indexes** tab → **Composite** → **Create index**, and add each of the
   indexes listed in `firestore.indexes.json` (collection, fields, in that order).

   (If you skip this, the queries that need them will fail with an error that
   contains a link to create that specific index, so you can also just click those
   links the first time each query runs.)

### 3b. (Optional) Turn on chat photos

Sharing photos in the crew chat needs Firebase Storage, which requires the **Blaze**
plan -- Google no longer offers Storage on Spark for new projects. Blaze has no base
fee; you're only billed past the same free quotas Spark gives everywhere else (5GB
stored, 1GB/day downloaded). For a small crew this should stay at $0. Skip this step
if you don't want a card on file -- everything else in the app works fine without it.

1. **⚙️ Project settings → Usage and billing → Details & settings → Modify plan** → choose **Blaze** and add a payment method.
   (Optional but recommended: set a budget alert, e.g. "notify me at $1", under Google Cloud Console → Billing → Budgets & alerts.)
2. **Build → Storage → Get started**, choose a location, keep the default bucket.
3. Open the **Rules** tab, replace everything with the contents of `storage.rules`, and click **Publish**.

### 4. Create a crew and its invite code

Each isolated group needs a `crews` document (its identity) and at least one
`inviteCodes` document (how people get into it). Do this once per crew.

1. Pick a **crewId**: lowercase letters/digits/hyphens only, e.g. `brothersandarms`.
2. In **Firestore Database → Data**, click **Start collection**.
3. Collection ID: `crews`. Document ID: your crewId (e.g. `brothersandarms`).
4. Add fields:
   - `name` (string) — shown as the crew's brand name in the header, e.g. `BrothersAndArms`
   - `competitionDate` (string, optional) — `YYYY-MM-DD`; powers the countdown. Skip it and the countdown just doesn't show.
   - `createdAt` (timestamp) — set to the current time
5. Save, then **Start collection** again.
6. Collection ID: `inviteCodes`.
7. Document ID: your invite code, in the form `<crewId>_<random suffix>`,
   e.g. `brothersandarms_X7K2M9RT` (the suffix is 4-20 letters/digits; make it hard to guess).
   The `<crewId>` part **must exactly match** the crew document id from step 3 --
   that's how the app knows which crew a code leads to.
8. Add field `crewId` (string) = the same crewId, and save.

Give that code to your friends -- they type it when signing up and land in that
crew. To stop new sign-ups, delete the `inviteCodes` document. To let a new wave
of people into the same crew, create another `inviteCodes` document with the same
`crewId` prefix. To start a **second, completely separate** crew, repeat this whole
section with a different crewId.

### 5. Connect the website to Firebase

1. **Project settings** (gear icon) → **Your apps** → click the **`</>`** (Web) icon.
2. Give it a nickname. **Don't** tick "Firebase Hosting".
3. Copy the `firebaseConfig` values into `js/firebase-config.js`.

These values are safe to publish; the security rules are what protect the data.

### 6. Put it on GitHub Pages

1. Create a **public** repository on GitHub, e.g. `workout-crew`.
   (Pages is free for public repos. The repo doesn't contain any passwords or the invite code.)
2. Upload all these files to it (drag-and-drop in the GitHub web UI works fine),
   keeping the folder structure.
3. Repo **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → **Save**.
4. After a minute the site is live at `https://YOUR-USERNAME.github.io/workout-crew/`.

### 7. Tell Firebase about your site

**Authentication → Settings → Authorized domains → Add domain** → `YOUR-USERNAME.github.io`

### 8. Add to iPhone home screen

Open the site in **Safari** → Share button → **Add to Home Screen**.

---

## Trying the backend before the GUI exists

Open the site in a desktop browser, open the developer console, and run:

```js
await api.signup({ email: 'you@example.com', password: 'secret123', displayName: 'Sam', groupCode: 'brothersandarms_X7K2M9RT' })
const me = await api.me()  // { ..., crewId: 'brothersandarms' }

await api.logWorkout({
  performedOn: api.today(),
  type: 'lift',
  durationMin: 45,
  notes: 'leg day',
  exercises: [{ name: 'Squat', sets: 5, reps: 5, weight: 225, unit: 'lb' }],
})

(await api.feed({ crewId: me.crewId })).workouts
await api.stats(me.crewId)        // last 7 days
await api.stats(me.crewId, 30)    // last 30 days
```

The page's "Loading…" line changes to show whether you're logged in.

## API reference (`js/api.js`)

Every function throws an `Error` with a message that's safe to show on screen.

**Session**
- `onSessionChange(cb)` → cb gets `{ user, member, crew }`. `user` is null when logged out; `member`/`crew`
  are null if logged in but not in a crew. Returns an unsubscribe function. (Right after `signup`, this can
  briefly report `member: null` before the profile is saved; call `api.me()` after signup finishes.)
- `signup({ email, password, displayName, groupCode })` → member. `groupCode` is `<crewId>_<suffix>`;
  the crew it joins is read straight off the code.
- `joinCrew({ displayName, groupCode })` → member (logged-in person without a profile)
- `login(email, password)` → member
- `logout()`, `resetPassword(email)`, `currentUserId()`

**Members** (all crew-scoped)
- `me()` → `{ id, crewId, displayName, avatarUrl, email, joinedAt }`
- `rename(displayName)`
- `setAvatar(file)` → uploads to Firebase Storage (images only, 8MB max), sets it as your profile picture. Requires the Blaze plan + `storage.rules` published.
- `members(crewId)` / `watchMembers(crewId, cb)` → `[{ id, crewId, displayName, avatarUrl, color, joinedAt }]`
  - `color`: avatars/calendar dots/weight chart are colored by a hash of each person's name, so colors are stable but arbitrary. To pin someone to a specific color (e.g. after a redesign, or because a friend group already associates colors with people), add a `color` field (hex string, e.g. `"#e0b400"`) to their `members/{uid}` document by hand in the console -- no app code change needed.

**Workouts**
- `logWorkout({ performedOn, type, durationMin?, notes?, rating?: 1-5, exercises? })` → workout (crewId is stamped from your own membership)
  - `exercises`: `[{ name, sets?, reps?, weight?, unit?: 'lb'|'kg', distanceKm?, durationMin? }]`
- `updateWorkout(id, { ...any of the above })`, `deleteWorkout(id)` (own workouts only)
- `getWorkout(id)`
- `feed({ crewId, userId?, from?, to?, type?, pageSize?, cursor? })` → `{ workouts, cursor }`;
  pass `cursor` back to load the next page (null means no more)
- `watchFeed(cb, { crewId, userId?, pageSize? })` → live-updating newest workouts; returns unsubscribe

A workout looks like:
```js
{ id, userId, isMine, performedOn: '2026-09-15', type: 'lift', durationMin: 45, notes, rating,
  exercises: [...], kudos: [uid...], kudosCount, kudoedByMe, createdAt, updatedAt, pending }
```

**Kudos**: `kudos(id)`, `unkudos(id)`

**Chat**: one shared channel per crew, permanent history.
- `sendMessage(text)`
- `sendPhoto(file, caption?)` → uploads to Firebase Storage (images only, 8MB max), posts with the caption. Requires the Blaze plan + `storage.rules` published.
- `watchChat(crewId, callback, onError?)` → cb gets `[{ id, userId, displayName, text, imageUrl, createdAt, pending }]`, oldest first (last 1000). Returns an unsubscribe function.

**Monthly weigh-in**: one entry per person per calendar month, can't be changed once logged.
- `currentMonth()` → `'YYYY-MM'`
- `logWeight(weight)` (lb)
- `myWeightThisMonth()` → `{ id, userId, month, weight, createdAt }` or `null`
- `watchWeights(crewId, callback, onError?)` → cb gets every weigh-in ever logged in that crew, newest month first. Returns an unsubscribe function.

**Leaderboard**: `stats(crewId, days = 7)` →
```js
{ range: { from, to, days },
  leaderboard: [{ user: { id, displayName }, workouts, minutes, activeDays,
                  streak: { current, best }, lastWorkoutOn }] }
```
Sorted by active days, then workouts, then minutes. Streaks look back 90 days.

## Migrating an existing (pre-crews) database

If your `members`/`workouts`/`messages`/`weights` docs already exist from before crews
were added, they have no `crewId` field. **Do these in order** -- publishing the new
rules or deploying the new frontend before the data is migrated will lock everyone
out (`crewId` won't exist yet, so every crew-scoped query/rule check fails):

1. Get a service account key: **Project settings → Service accounts → Generate new private key**.
   Keep it out of git -- `scripts/.gitignore` already excludes `serviceAccountKey*.json`.
2. `cd scripts && npm install`
3. **Back it up first:** `node backup-all.mjs --service-account ./serviceAccountKey.json`
   Backs up Firestore data, Storage files (avatars/chat photos/progress photos), and the
   Authentication account list, all into `scripts/backups/<timestamp>/` (gitignored -- it's
   your friends' real data, never commit it). If anything below goes wrong, restore Firestore
   with `node restore-firestore.mjs --service-account ./serviceAccountKey.json --in ./backups/<timestamp> --apply`
   and/or Storage with `node restore-storage.mjs --service-account ./serviceAccountKey.json --in ./backups/<timestamp>/storage --apply`.
   (The Auth backup is names/uids only, for reference -- it can't restore anyone's password. See
   the comment at the top of `backup-auth.mjs` if you want a password-hash-inclusive backup too.)
4. Dry run the migration: `node migrate-to-crews.mjs --service-account ./serviceAccountKey.json --crew-id brothersandarms --crew-name "BrothersAndArms"`
   Check the counts it prints look right.
5. Apply it: add `--apply` to the same command. It creates the `crews` doc, mints a
   fresh invite code for future sign-ups (printed once -- save it), and backfills
   `crewId` onto every existing `members`/`workouts`/`messages`/`weights` doc.
6. *Now* publish the new `firestore.rules` and `storage.rules` (Firestore/Storage → Rules → Publish).
7. *Now* deploy the new frontend (push to `main`; see below).
8. Delete the service account key file when you're done -- it's a permanent admin credential.

## Deploying updates

Edit files in the repo; Pages redeploys automatically. When you change any file, also bump
`VERSION` in `sw.js` (e.g. `v1` → `v2`) so phones fetch the new version.

## Keeping it running for years

- **Free-tier headroom**: Spark allows 50k reads and 20k writes per day. A crew of 10 logging daily
  and checking the leaderboard a few times a day uses a small fraction of that.
- **Firebase SDK** is pinned to version 12.19.0 in `js/api.js`; pinned versions keep working.
  Upgrading is optional.
- **Backups**: Firestore on Spark has no automatic backups. Every so often, you can copy the data out
  via the Firestore console, or ask for an "export my data" button when the GUI is built.
- **Removing someone**: delete their document in `members` (and their account under Authentication).
