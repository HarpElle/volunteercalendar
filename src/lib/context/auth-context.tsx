"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import type { UserProfile, Membership } from "@/lib/types";
import {
  signUp as fbSignUp,
  signIn as fbSignIn,
  signOut as fbSignOut,
  resetPassword as fbResetPassword,
  getUserProfile,
  onAuthChange,
} from "@/lib/firebase/auth";
import { getUserMemberships, createMembership, getDocument } from "@/lib/firebase/firestore";

// --- State ---

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  memberships: Membership[];
  activeMembership: Membership | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  profile: null,
  memberships: [],
  activeMembership: null,
  loading: true,
  error: null,
};

// --- Actions ---

type AuthAction =
  | {
      type: "AUTH_STATE_CHANGED";
      user: User | null;
      profile: UserProfile | null;
      memberships: Membership[];
      activeMembership: Membership | null;
    }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_ERROR" }
  | { type: "SWITCH_ORG"; membership: Membership }
  | { type: "MEMBERSHIPS_UPDATED"; memberships: Membership[]; activeMembership: Membership | null };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "AUTH_STATE_CHANGED":
      return {
        ...state,
        user: action.user,
        profile: action.profile,
        memberships: action.memberships,
        activeMembership: action.activeMembership,
        loading: false,
        error: null,
      };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    case "SWITCH_ORG":
      return { ...state, activeMembership: action.membership };
    case "MEMBERSHIPS_UPDATED":
      return {
        ...state,
        memberships: action.memberships,
        activeMembership: action.activeMembership,
      };
  }
}

// --- Context ---

interface AuthContextValue extends AuthState {
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
  switchOrg: (churchId: string) => void;
  refreshMemberships: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// --- Helpers ---

/**
 * Pick the best active membership to use by default.
 * Priority: default_church_id from profile, then first active membership.
 */
function pickActiveMembership(
  memberships: Membership[],
  profile: UserProfile | null,
): Membership | null {
  const active = memberships.filter((m) => m.status === "active");
  if (active.length === 0) return null;

  // Prefer the user's stored default church
  if (profile?.default_church_id) {
    const preferred = active.find((m) => m.church_id === profile.default_church_id);
    if (preferred) return preferred;
  }

  // Fall back to legacy church_id
  if (profile?.church_id) {
    const legacy = active.find((m) => m.church_id === profile.church_id);
    if (legacy) return legacy;
  }

  return active[0];
}

// --- Provider ---

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    const unsubscribe = onAuthChange(async (user) => {
      if (user) {
        let [profile, memberships] = await Promise.all([
          getUserProfile(user.uid),
          getUserMemberships(user.uid),
        ]);

        // Repair legacy accounts: if user has a church_id but no membership, auto-create owner membership
        const churchId = profile?.church_id || profile?.default_church_id;
        if (churchId && memberships.length === 0) {
          const church = await getDocument("churches", churchId);
          if (church) {
            const now = new Date().toISOString();
            await createMembership({
              user_id: user.uid,
              church_id: churchId,
              role: "owner",
              ministry_scope: [],
              status: "active",
              invited_by: null,
              volunteer_id: null,
              reminder_preferences: { channels: ["email"] },
              created_at: now,
              updated_at: now,
            });
            memberships = await getUserMemberships(user.uid);
          }
        }

        const activeMembership = pickActiveMembership(memberships, profile);
        dispatch({
          type: "AUTH_STATE_CHANGED",
          user,
          profile,
          memberships,
          activeMembership,
        });
      } else {
        dispatch({
          type: "AUTH_STATE_CHANGED",
          user: null,
          profile: null,
          memberships: [],
          activeMembership: null,
        });
      }
    });
    return unsubscribe;
  }, []);

  async function signUp(email: string, password: string, displayName: string) {
    dispatch({ type: "CLEAR_ERROR" });
    try {
      await fbSignUp(email, password, displayName);
      // onAuthChange listener will handle loading → false via AUTH_STATE_CHANGED
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: firebaseErrorMessage(err) });
      throw err;
    }
  }

  async function signIn(email: string, password: string) {
    dispatch({ type: "CLEAR_ERROR" });
    try {
      await fbSignIn(email, password);
      // onAuthChange listener will handle loading → false via AUTH_STATE_CHANGED
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: firebaseErrorMessage(err) });
      throw err;
    }
  }

  async function signOut() {
    try {
      await fbSignOut();
      // onAuthChange listener will handle loading → false via AUTH_STATE_CHANGED
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: firebaseErrorMessage(err) });
      throw err;
    }
  }

  async function resetPassword(email: string) {
    dispatch({ type: "SET_LOADING", loading: true });
    dispatch({ type: "CLEAR_ERROR" });
    try {
      await fbResetPassword(email);
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: firebaseErrorMessage(err) });
      throw err;
    } finally {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }

  function clearError() {
    dispatch({ type: "CLEAR_ERROR" });
  }

  const switchOrg = useCallback(
    (churchId: string) => {
      const membership = state.memberships.find(
        (m) => m.church_id === churchId && m.status === "active",
      );
      if (membership) {
        dispatch({ type: "SWITCH_ORG", membership });
      }
    },
    [state.memberships],
  );

  const refreshMemberships = useCallback(async () => {
    if (!state.user) return;
    const memberships = await getUserMemberships(state.user.uid);
    const activeMembership = state.activeMembership
      ? memberships.find((m) => m.id === state.activeMembership!.id && m.status === "active") ||
        pickActiveMembership(memberships, state.profile)
      : pickActiveMembership(memberships, state.profile);
    dispatch({ type: "MEMBERSHIPS_UPDATED", memberships, activeMembership });
  }, [state.user, state.activeMembership, state.profile]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signUp,
        signIn,
        signOut,
        resetPassword,
        clearError,
        switchOrg,
        refreshMemberships,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// --- Hook ---

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

// --- Error mapping ---

function firebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code;
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    default:
      return (err as Error).message || "An unexpected error occurred.";
  }
}
