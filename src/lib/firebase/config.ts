import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Track whether this is the first initialization so we can call initializeFirestore
// exactly once (calling it on an already-initialized app throws).
const isNew = getApps().length === 0;
const app = isNew ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Enable persistent local cache (IndexedDB) so repeat page loads are fast.
// persistentMultipleTabManager allows multiple browser tabs to share the cache.
//
// `experimentalAutoDetectLongPolling: true` — Safari + Firefox specific.
// Firebase Auth uses an iframe at <project>.firebaseapp.com for cross-tab
// session sync. Safari's Intelligent Tracking Prevention (ITP) clears
// third-party cookies for sites the user hasn't visited in ~7 days,
// breaking that iframe's cookie handshake. Without it, Firestore's
// real-time WebChannel (Listen/channel endpoint) fails with "Fetch API
// cannot load ... due to access control checks" and the auth flow
// deadlocks — the dashboard spins forever.
//
// Auto-detect probes the network and falls back to HTTP long-polling
// (slightly slower but reliable) when WebChannel can't connect. Chrome
// keeps using WebChannel since auto-detect succeeds. Zero impact on
// browsers where the channel works.
//
// Reported by Jason 2026-05-25: Anchor Falls login spun indefinitely
// in Safari after he'd been logged in to Codex test orgs for a week+
// without touching Anchor Falls. Same symptoms documented in
// firebase/firebase-js-sdk#7026 and many other reports.
const db = isNew
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
      experimentalAutoDetectLongPolling: true,
    })
  : getFirestore(app);

export { app, auth, db };
