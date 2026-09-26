// Workout Crew data layer. The GUI should only talk to Firebase through this file.
//
// Also exposed as `window.api` so you can try everything from Safari/Chrome dev tools
// before the GUI exists.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail, deleteUser,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, orderBy, limit, startAfter, onSnapshot,
  serverTimestamp, arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';

import { firebaseConfig } from './firebase-config.js';
import * as v from './validate.js';
import { addDays, localToday, localMonth, makeSortKey, buildLeaderboard } from './stats.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Local cache makes the home-screen app open fast and cuts down on reads.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
const storage = getStorage(app);

const crewsCol = collection(db, 'crews');
const membersCol = collection(db, 'members');
const workoutsCol = collection(db, 'workouts');
const messagesCol = collection(db, 'messages');
const weightsCol = collection(db, 'weights');
const STREAK_HISTORY_DAYS = 90; // streaks longer than this show as 90

// ---------------------------------------------------------------------------
// Errors: turn Firebase codes into messages you can show on screen.
// ---------------------------------------------------------------------------
const FRIENDLY = {
  'auth/email-already-in-use': 'That email already has an account. Try logging in.',
  'auth/invalid-email': 'That email address looks wrong.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No connection. Check your internet.',
  'permission-denied': "You don't have permission to do that.",
  'unavailable': 'Offline right now. Changes will sync when you reconnect.',
  'storage/unauthorized': "You don't have permission to upload that.",
  'storage/canceled': 'Upload canceled.',
  'storage/quota-exceeded': 'Storage is full for now. Try again later.',
};
function friendly(err) {
  if (err instanceof v.ValidationError) return err;
  const e = new Error(FRIENDLY[err?.code] || err?.message || 'Something went wrong');
  e.code = err?.code;
  e.cause = err;
  return e;
}
const wrap = (fn) => async (...args) => {
  try { return await fn(...args); } catch (err) { throw friendly(err); }
};

function requireUser() {
  const u = auth.currentUser;
  if (!u) throw new Error('Please log in');
  return u;
}

// ---------------------------------------------------------------------------
// Shapes returned to the GUI
// ---------------------------------------------------------------------------
function toMember(snap) {
  const d = snap.data();
  return {
    id: snap.id,
    crewId: d.crewId,
    displayName: d.displayName,
    avatarUrl: d.avatarUrl ?? null,
    // Optional fixed avatar color, set by hand in the console (e.g. '#e0b400').
    // Falls back to a generic hash-based color when not set.
    color: d.color ?? null,
    // 'open': freeform check-ins (default). 'structured': check-in also offers
    // a Workout A / Workout B pick per muscle group, from js/routines.js templates.
    liftMode: d.liftMode ?? 'open',
    joinedAt: d.joinedAt?.toDate() ?? null,
  };
}

function toCrew(snap) {
  const d = snap.data();
  return { id: snap.id, name: d.name, competitionDate: d.competitionDate ?? null };
}

function toMessage(snap) {
  const d = snap.data();
  return {
    id: snap.id,
    userId: d.userId,
    displayName: d.displayName,
    text: d.text,
    imageUrl: d.imageUrl ?? null,
    createdAt: d.createdAt?.toDate() ?? null,
    pending: snap.metadata.hasPendingWrites,
  };
}

function toWeight(snap) {
  const d = snap.data();
  return {
    id: snap.id,
    userId: d.userId,
    month: d.month,
    weight: d.weight,
    photoUrl: d.photoUrl,
    createdAt: d.createdAt?.toDate() ?? null,
  };
}

function toWorkout(snap) {
  const d = snap.data();
  const me = auth.currentUser?.uid;
  const kudos = d.kudos ?? [];
  return {
    id: snap.id,
    userId: d.userId,
    isMine: d.userId === me,
    performedOn: d.performedOn,
    type: d.type,
    durationMin: d.durationMin ?? null,
    notes: d.notes ?? null,
    rating: d.rating ?? null,
    exercises: d.exercises ?? [],
    kudos,
    kudosCount: kudos.length,
    kudoedByMe: kudos.includes(me),
    // serverTimestamp is null for a moment on writes made while offline.
    createdAt: d.createdAt?.toDate() ?? null,
    updatedAt: d.updatedAt?.toDate() ?? null,
    pending: snap.metadata.hasPendingWrites,
  };
}

// Feed query builder. Date filters use sortKey so no extra indexes are needed.
function feedQuery({ crewId, userId, from, to, pageSize = 20, after } = {}) {
  if (!crewId) throw new Error('crewId is required');
  const parts = [where('crewId', '==', crewId)];
  if (userId) parts.push(where('userId', '==', userId));
  if (from) {
    if (!v.isDate(from)) throw new v.ValidationError('from must be a date');
    parts.push(where('sortKey', '>=', from));
  }
  if (to) {
    if (!v.isDate(to)) throw new v.ValidationError('to must be a date');
    parts.push(where('sortKey', '<', addDays(to, 1)));
  }
  parts.push(orderBy('sortKey', 'desc'));
  if (after) parts.push(startAfter(after));
  parts.push(limit(Math.min(Math.max(pageSize, 1), 100)));
  return query(workoutsCol, ...parts);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const api = {
  today: localToday,

  // ---- session ----

  /** Calls back with { user, member, crew } whenever login state changes.
   *  user = null when logged out. member/crew = null when logged in but not in a crew yet. */
  onSessionChange(callback) {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return callback({ user: null, member: null, crew: null });
      let member = null;
      let crew = null;
      try {
        const snap = await getDoc(doc(membersCol, user.uid));
        if (snap.exists()) {
          member = toMember(snap);
          const crewSnap = await getDoc(doc(crewsCol, member.crewId));
          if (crewSnap.exists()) crew = toCrew(crewSnap);
        }
      } catch { /* offline with nothing cached: treat as unknown */ }
      callback({ user: { id: user.uid, email: user.email }, member, crew });
    });
  },

  currentUserId: () => auth.currentUser?.uid ?? null,

  /** Create an account and join the crew (identified by the invite code) in one step. */
  signup: wrap(async ({ email, password, displayName, groupCode }) => {
    const name = v.displayName(displayName);
    const code = v.inviteCode(groupCode);
    const crewId = v.crewIdFromInviteCode(code);
    const cred = await createUserWithEmailAndPassword(auth, String(email).trim(), password);
    try {
      await setDoc(doc(membersCol, cred.user.uid), {
        displayName: name, inviteCode: code, crewId, joinedAt: serverTimestamp(),
      });
    } catch (err) {
      // Bad group code: remove the half-made account so they can try again.
      await deleteUser(cred.user).catch(() => signOut(auth));
      if (err.code === 'permission-denied') throw new v.ValidationError('Wrong group code');
      throw err;
    }
    return api.me();
  }),

  /** For someone who's logged in but has no member profile yet. */
  joinCrew: wrap(async ({ displayName, groupCode }) => {
    const user = requireUser();
    const code = v.inviteCode(groupCode);
    const crewId = v.crewIdFromInviteCode(code);
    try {
      await setDoc(doc(membersCol, user.uid), {
        displayName: v.displayName(displayName),
        inviteCode: code,
        crewId,
        joinedAt: serverTimestamp(),
      });
    } catch (err) {
      if (err.code === 'permission-denied') throw new v.ValidationError('Wrong group code');
      throw err;
    }
    return api.me();
  }),

  login: wrap(async (email, password) => {
    await signInWithEmailAndPassword(auth, String(email).trim(), password);
    return api.me();
  }),

  logout: wrap(() => signOut(auth)),

  resetPassword: wrap((email) => sendPasswordResetEmail(auth, String(email).trim())),

  // ---- members ----

  me: wrap(async () => {
    const user = requireUser();
    const snap = await getDoc(doc(membersCol, user.uid));
    return snap.exists() ? { ...toMember(snap), email: user.email } : null;
  }),

  rename: wrap(async (displayName) => {
    const user = requireUser();
    await updateDoc(doc(membersCol, user.uid), { displayName: v.displayName(displayName) });
    return api.me();
  }),

  /** 'open' (freeform, default) or 'structured' (adds a Workout A/B pick to check-in). */
  setLiftMode: wrap(async (mode) => {
    const user = requireUser();
    await updateDoc(doc(membersCol, user.uid), { liftMode: v.liftMode(mode) });
    return api.me();
  }),

  /** Set or replace your profile picture. Images only, 8MB max. */
  setAvatar: wrap(async (file) => {
    const user = requireUser();
    const member = await api.me();
    if (!member) throw new Error('Join the crew first');
    if (!file.type.startsWith('image/')) throw new v.ValidationError('Only images can be uploaded');
    if (file.size > 8 * 1024 * 1024) throw new v.ValidationError('Photo must be under 8MB');
    const sref = storageRef(storage, `avatars/${member.crewId}/${user.uid}/photo`);
    await uploadBytes(sref, file, { contentType: file.type });
    const avatarUrl = await getDownloadURL(sref);
    await updateDoc(doc(membersCol, user.uid), { avatarUrl });
    return api.me();
  }),

  members: wrap(async (crewId) => {
    const snap = await getDocs(query(membersCol, where('crewId', '==', crewId), orderBy('displayName')));
    return snap.docs.map(toMember);
  }),

  /** Live list of members in a crew. Returns an unsubscribe function. */
  watchMembers(crewId, callback, onError) {
    return onSnapshot(query(membersCol, where('crewId', '==', crewId), orderBy('displayName')),
      (snap) => callback(snap.docs.map(toMember)),
      (err) => onError?.(friendly(err)));
  },

  // ---- workouts ----

  /** input: { performedOn, type, durationMin?, notes?, rating?: 1-5, exercises? }
   *  exercises: [{ name, sets?, reps?, weight?, unit?: 'lb'|'kg', distanceKm?, durationMin? }] */
  logWorkout: wrap(async (input) => {
    const user = requireUser();
    const member = await api.me();
    if (!member) throw new Error('Join the crew first');
    const w = v.workout(input);
    const ref = await addDoc(workoutsCol, {
      userId: user.uid,
      crewId: member.crewId,
      ...w,
      sortKey: makeSortKey(w.performedOn),
      kudos: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return api.getWorkout(ref.id);
  }),

  getWorkout: wrap(async (id) => {
    const snap = await getDoc(doc(workoutsCol, id));
    return snap.exists() ? toWorkout(snap) : null;
  }),

  /** Change any of: performedOn, type, durationMin, notes, rating, exercises. Own workouts only. */
  updateWorkout: wrap(async (id, fields) => {
    const changes = v.workout(fields, { partial: true });
    const ref = doc(workoutsCol, id);
    if (changes.performedOn) {
      const current = await getDoc(ref);
      if (!current.exists()) throw new Error('Workout not found');
      const suffix = current.data().sortKey.split('_').slice(1).join('_');
      changes.sortKey = makeSortKey(changes.performedOn, suffix);
    }
    await updateDoc(ref, { ...changes, updatedAt: serverTimestamp() });
    return api.getWorkout(id);
  }),

  deleteWorkout: wrap((id) => deleteDoc(doc(workoutsCol, id))),

  /** One page of the feed, newest first.
   *  filters: { crewId, userId?, from?, to?, type?, pageSize?, cursor? }
   *  Returns { workouts, cursor } -- pass cursor back in to get the next page (null = no more). */
  feed: wrap(async ({ cursor, type, ...filters } = {}) => {
    const pageSize = filters.pageSize ?? 20;
    const snap = await getDocs(feedQuery({ ...filters, pageSize, after: cursor }));
    let workouts = snap.docs.map(toWorkout);
    if (type) workouts = workouts.filter((w) => w.type === type.toLowerCase());
    return {
      workouts,
      cursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
    };
  }),

  /** Live feed of the most recent workouts in a crew. Returns an unsubscribe function. */
  watchFeed(callback, { crewId, userId, pageSize = 30 } = {}, onError) {
    return onSnapshot(feedQuery({ crewId, userId, pageSize }),
      (snap) => callback(snap.docs.map(toWorkout)),
      (err) => onError?.(friendly(err)));
  },

  // ---- kudos ----

  kudos: wrap(async (id) => {
    const user = requireUser();
    await updateDoc(doc(workoutsCol, id), { kudos: arrayUnion(user.uid) });
  }),

  unkudos: wrap(async (id) => {
    const user = requireUser();
    await updateDoc(doc(workoutsCol, id), { kudos: arrayRemove(user.uid) });
  }),

  // ---- chat ----

  /** One shared, permanent channel per crew. */
  sendMessage: wrap(async (text) => {
    const user = requireUser();
    const member = await api.me();
    if (!member) throw new Error('Join the crew first');
    const msg = v.chatMessage(text);
    await addDoc(messagesCol, {
      userId: user.uid,
      crewId: member.crewId,
      displayName: member.displayName,
      text: msg,
      createdAt: serverTimestamp(),
    });
  }),

  /** Share a photo, with an optional caption, to the crew chat. Max 8MB, images only. */
  sendPhoto: wrap(async (file, caption = '') => {
    const user = requireUser();
    const member = await api.me();
    if (!member) throw new Error('Join the crew first');
    if (!file.type.startsWith('image/')) throw new v.ValidationError('Only images can be shared');
    if (file.size > 8 * 1024 * 1024) throw new v.ValidationError('Image must be under 8MB');
    const path = `chatImages/${member.crewId}/${user.uid}/${Date.now()}_${file.name}`;
    const sref = storageRef(storage, path);
    await uploadBytes(sref, file, { contentType: file.type });
    const imageUrl = await getDownloadURL(sref);
    await addDoc(messagesCol, {
      userId: user.uid,
      crewId: member.crewId,
      displayName: member.displayName,
      text: String(caption || '').trim().slice(0, 2000),
      imageUrl,
      createdAt: serverTimestamp(),
    });
  }),

  /** Live, full-history chat feed for a crew (oldest first). Returns an unsubscribe function. */
  watchChat(crewId, callback, onError) {
    return onSnapshot(
      query(messagesCol, where('crewId', '==', crewId), orderBy('createdAt', 'asc'), limit(1000)),
      (snap) => callback(snap.docs.map(toMessage)),
      (err) => onError?.(friendly(err)));
  },

  // ---- monthly weigh-in ----

  currentMonth: localMonth,

  /** One weigh-in per person per calendar month; can't be changed once logged.
   *  A progress photo is required alongside the weight. */
  logWeight: wrap(async (weight, photoFile) => {
    const user = requireUser();
    const member = await api.me();
    if (!member) throw new Error('Join the crew first');
    const w = v.bodyWeight(weight);
    if (!photoFile) throw new v.ValidationError('Add a progress photo with your weigh-in');
    if (!photoFile.type.startsWith('image/')) throw new v.ValidationError('Only images can be uploaded');
    if (photoFile.size > 8 * 1024 * 1024) throw new v.ValidationError('Photo must be under 8MB');
    const month = localMonth();
    const sref = storageRef(storage, `progressPhotos/${member.crewId}/${user.uid}/${month}_${Date.now()}`);
    await uploadBytes(sref, photoFile, { contentType: photoFile.type });
    const photoUrl = await getDownloadURL(sref);
    try {
      await setDoc(doc(weightsCol, `${user.uid}_${month}`), {
        userId: user.uid, crewId: member.crewId, month, weight: w, photoUrl, createdAt: serverTimestamp(),
      });
    } catch (err) {
      if (err.code === 'permission-denied') throw new Error("You've already logged your weight this month");
      throw err;
    }
  }),

  myWeightThisMonth: wrap(async () => {
    const user = requireUser();
    const snap = await getDoc(doc(weightsCol, `${user.uid}_${localMonth()}`));
    return snap.exists() ? toWeight(snap) : null;
  }),

  /** Live list of every weigh-in ever logged in a crew, newest month first. */
  watchWeights(crewId, callback, onError) {
    return onSnapshot(query(weightsCol, where('crewId', '==', crewId), orderBy('month', 'desc')),
      (snap) => callback(snap.docs.map(toWeight)),
      (err) => onError?.(friendly(err)));
  },

  // ---- leaderboard ----

  /** Leaderboard for the last `days` days (default 7), plus streaks.
   *  Returns { range: {from, to, days}, leaderboard: [{ user, workouts, minutes, activeDays,
   *            streak: {current, best}, lastWorkoutOn }] } */
  stats: wrap(async (crewId, days = 7) => {
    days = Math.min(Math.max(Math.round(days) || 7, 1), STREAK_HISTORY_DAYS);
    const today = localToday();
    const historyFrom = addDays(today, -(STREAK_HISTORY_DAYS - 1));
    const [members, snap] = await Promise.all([
      api.members(crewId),
      getDocs(query(workoutsCol,
        where('crewId', '==', crewId),
        where('sortKey', '>=', historyFrom),
        orderBy('sortKey', 'desc'),
        limit(2000))),
    ]);
    const workouts = snap.docs.map((s) => s.data());
    return buildLeaderboard(members, workouts, { today, days });
  }),
};

window.api = api;
export default api;
