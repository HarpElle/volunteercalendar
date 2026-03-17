import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  // Use Application Default Credentials in production (Vercel),
  // or GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_ADMIN_KEY in dev
  const adminKey = process.env.FIREBASE_ADMIN_KEY;
  if (adminKey) {
    const serviceAccount = JSON.parse(adminKey);
    return initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  // Fallback: use project ID only (works with Application Default Credentials)
  return initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const app = getAdminApp();
export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
