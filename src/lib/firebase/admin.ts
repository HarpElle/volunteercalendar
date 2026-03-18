import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Lazy singletons — initialized on first use (at request time), not at build time.
// This ensures Vercel Production env vars are available when credentials are read.
let _app: App | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

function getAdminApp(): App {
  if (_app) return _app;

  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0];
    return _app;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  // Option 1: Full service account JSON blob (FIREBASE_ADMIN_KEY)
  const adminKey = process.env.FIREBASE_ADMIN_KEY;
  if (adminKey) {
    const serviceAccount = JSON.parse(adminKey);
    _app = initializeApp({
      credential: cert(serviceAccount),
      projectId,
    });
    return _app;
  }

  // Option 2: Individual fields (Vercel env vars)
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (clientEmail && privateKey) {
    _app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || projectId,
        clientEmail,
        // Vercel stores \n as literal characters — replace them
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
      projectId,
    });
    return _app;
  }

  // Fallback: Application Default Credentials (local dev with gcloud CLI)
  _app = initializeApp({ projectId });
  return _app;
}

export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_, prop) {
    if (!_auth) _auth = getAuth(getAdminApp());
    return (_auth as unknown as Record<string, unknown>)[prop as string];
  },
});

export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_, prop) {
    if (!_db) _db = getFirestore(getAdminApp());
    return (_db as unknown as Record<string, unknown>)[prop as string];
  },
});
