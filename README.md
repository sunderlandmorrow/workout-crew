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

| File | What it is |
|---|---|
| `firestore.rules` | The backend logic. Only people with the invite code can join; you can only edit your own workouts; anyone in the crew can give kudos; anyone in the crew can read/post to the shared chat. |
| `firestore.indexes.json` | One database index the "filter feed by person" query needs. |
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
5. Open the **Indexes** tab → **Composite** → **Create index**:
   - Collection ID: `workouts`
   - Field 1: `userId`, Ascending
   - Field 2: `sortKey`, Descending
   - Query scope: Collection

   (If you skip this, the "one person's workouts" filter will fail with an error
   that contains a link to create it, so you can also just click that.)

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

### 4. Create your group's invite code

1. In **Firestore Database → Data**, click **Start collection**.
2. Collection ID: `inviteCodes`
3. Document ID: your secret code, e.g. `iron-crew-58213`
   (6+ characters, letters/numbers/`-`/`_` only; make it hard to guess).
4. Add any field, e.g. `note` = `friends`, and save.

Friends type this code when signing up. To stop new sign-ups, delete the document.
To let a new wave of people in, create a new code.

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
await api.signup({ email: 'you@example.com', password: 'secret123', displayName: 'Sam', groupCode: 'iron-crew-58213' })

await api.logWorkout({
  performedOn: api.today(),
  type: 'lift',
  durationMin: 45,
  notes: 'leg day',
  exercises: [{ name: 'Squat', sets: 5, reps: 5, weight: 225, unit: 'lb' }],
})

(await api.feed()).workouts
await api.stats()          // last 7 days
await api.stats(30)        // last 30 days
```

The page's "Loading…" line changes to show whether you're logged in.

## API reference (`js/api.js`)

Every function throws an `Error` with a message that's safe to show on screen.

**Session**
- `onSessionChange(cb)` → cb gets `{ user, member }`. `user` is null when logged out; `member` is null
  if logged in but not in the crew. Returns an unsubscribe function. (Right after `signup`, this can
  briefly report `member: null` before the profile is saved; call `api.me()` after signup finishes.)
- `signup({ email, password, displayName, groupCode })` → member
- `joinCrew({ displayName, groupCode })` → member (logged-in person without a profile)
- `login(email, password)` → member
- `logout()`, `resetPassword(email)`, `currentUserId()`

**Members**
- `me()` → `{ id, displayName, avatarUrl, email, joinedAt }`
- `rename(displayName)`
- `setAvatar(file)` → uploads to Firebase Storage (images only, 8MB max), sets it as your profile picture. Requires the Blaze plan + `storage.rules` published.
- `members()` / `watchMembers(cb)` → `[{ id, displayName, avatarUrl, joinedAt }]`

**Workouts**
- `logWorkout({ performedOn, type, durationMin?, notes?, exercises? })` → workout
  - `exercises`: `[{ name, sets?, reps?, weight?, unit?: 'lb'|'kg', distanceKm?, durationMin? }]`
- `updateWorkout(id, { ...any of the above })`, `deleteWorkout(id)` (own workouts only)
- `getWorkout(id)`
- `feed({ userId?, from?, to?, type?, pageSize?, cursor? })` → `{ workouts, cursor }`;
  pass `cursor` back to load the next page (null means no more)
- `watchFeed(cb, { userId?, pageSize? })` → live-updating newest workouts; returns unsubscribe

A workout looks like:
```js
{ id, userId, isMine, performedOn: '2026-09-15', type: 'lift', durationMin: 45, notes,
  exercises: [...], kudos: [uid...], kudosCount, kudoedByMe, createdAt, updatedAt, pending }
```

**Kudos**: `kudos(id)`, `unkudos(id)`

**Chat**: one shared channel, permanent history.
- `sendMessage(text)`
- `sendPhoto(file, caption?)` → uploads to Firebase Storage (images only, 8MB max), posts with the caption. Requires the Blaze plan + `storage.rules` published.
- `watchChat(callback, onError?)` → cb gets `[{ id, userId, displayName, text, imageUrl, createdAt, pending }]`, oldest first (last 1000). Returns an unsubscribe function.

**Monthly weigh-in**: one entry per person per calendar month, can't be changed once logged.
- `currentMonth()` → `'YYYY-MM'`
- `logWeight(weight)` (lb)
- `myWeightThisMonth()` → `{ id, userId, month, weight, createdAt }` or `null`
- `watchWeights(callback, onError?)` → cb gets every weigh-in ever logged, newest month first. Returns an unsubscribe function.

**Leaderboard**: `stats(days = 7)` →
```js
{ range: { from, to, days },
  leaderboard: [{ user: { id, displayName }, workouts, minutes, activeDays,
                  streak: { current, best }, lastWorkoutOn }] }
```
Sorted by active days, then workouts, then minutes. Streaks look back 90 days.

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
