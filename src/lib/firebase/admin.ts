import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";

// Lazy singletons — initialized on first use (at request time), not at build time.
// This ensures Vercel Production env vars are available when credentials are read.
let _app: App | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: Storage | null = null;

function getAdminApp(): App {
  if (_app) return _app;

  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0];
    return _app;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  // Option 1: Full service account JSON blob (FIREBASE_ADMIN_KEY)
  const adminKey = process.env.FIREBASE_ADMIN_KEY;
  if (adminKey) {
    const serviceAccount = JSON.parse(adminKey);
    _app = initializeApp({
      credential: cert(serviceAccount),
      projectId,
      storageBucket,
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
      storageBucket,
    });
    return _app;
  }

  // No explicit credentials available. On Vercel/serverless, Application
  // Default Credentials cannot work — fail fast with a clear error instead
  // of letting the SDK spend ~10s retrying Google Auth lookups before
  // surfacing a generic "Could not load the default credentials" error.
  // Local dev with `gcloud auth application-default login` will hit the
  // VERCEL guard below and intentionally fall through to ADC.
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error(
      "Firebase Admin SDK credentials are not configured. Set either " +
        "FIREBASE_ADMIN_KEY (full service-account JSON) OR both " +
        "FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY in the " +
        "Vercel project's environment variables — and make sure the scope " +
        "includes the environment where you're seeing this error (Preview / " +
        "Production / both).",
    );
  }

  // Fallback: Application Default Credentials (local dev with gcloud CLI)
  _app = initializeApp({ projectId, storageBucket });
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

export const adminStorage: Storage = new Proxy({} as Storage, {
  get(_, prop) {
    if (!_storage) _storage = getStorage(getAdminApp());
    return (_storage as unknown as Record<string, unknown>)[prop as string];
  },
});
