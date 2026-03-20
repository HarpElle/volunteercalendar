import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
  updatePassword as fbUpdatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./config";
import type { UserProfile } from "@/lib/types";

export async function signUp(email: string, password: string, displayName: string, phone?: string) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const profile: Omit<UserProfile, "id"> = {
    email,
    display_name: displayName,
    phone: phone?.trim() || null,
    default_church_id: null,
    church_id: "",
    role: "admin",
    ministry_ids: [],
    global_availability: {
      blockout_dates: [],
      recurring_unavailable: [],
    },
    created_at: new Date().toISOString(),
  };
  await setDoc(doc(db, "users", credential.user.uid), profile);
  return credential.user;
}

export async function signIn(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signOut() {
  return firebaseSignOut(auth);
}

export async function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as UserProfile;
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function updateUserDisplayName(displayName: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await updateProfile(user, { displayName });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error("Not authenticated");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await fbUpdatePassword(user, newPassword);
}

export async function deleteCurrentUser() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  await deleteUser(user);
}
