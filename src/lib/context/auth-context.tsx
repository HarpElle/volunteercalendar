"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import type { UserProfile } from "@/lib/types";
import {
  signUp as fbSignUp,
  signIn as fbSignIn,
  signOut as fbSignOut,
  resetPassword as fbResetPassword,
  getUserProfile,
  onAuthChange,
} from "@/lib/firebase/auth";

// --- State ---

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  profile: null,
  loading: true,
  error: null,
};

// --- Actions ---

type AuthAction =
  | { type: "AUTH_STATE_CHANGED"; user: User | null; profile: UserProfile | null }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_ERROR" };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "AUTH_STATE_CHANGED":
      return {
        ...state,
        user: action.user,
        profile: action.profile,
        loading: false,
        error: null,
      };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false };
    case "CLEAR_ERROR":
      return { ...state, error: null };
  }
}

// --- Context ---

interface AuthContextValue extends AuthState {
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// --- Provider ---

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    const unsubscribe = onAuthChange(async (user) => {
      if (user) {
        const profile = await getUserProfile(user.uid);
        dispatch({ type: "AUTH_STATE_CHANGED", user, profile });
      } else {
        dispatch({ type: "AUTH_STATE_CHANGED", user: null, profile: null });
      }
    });
    return unsubscribe;
  }, []);

  async function signUp(email: string, password: string, displayName: string) {
    dispatch({ type: "SET_LOADING", loading: true });
    dispatch({ type: "CLEAR_ERROR" });
    try {
      await fbSignUp(email, password, displayName);
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: firebaseErrorMessage(err) });
      throw err;
    }
  }

  async function signIn(email: string, password: string) {
    dispatch({ type: "SET_LOADING", loading: true });
    dispatch({ type: "CLEAR_ERROR" });
    try {
      await fbSignIn(email, password);
    } catch (err) {
      dispatch({ type: "SET_ERROR", error: firebaseErrorMessage(err) });
      throw err;
    }
  }

  async function signOut() {
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      await fbSignOut();
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

  return (
    <AuthContext.Provider
      value={{ ...state, signUp, signIn, signOut, resetPassword, clearError }}
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

// --- Helpers ---

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
