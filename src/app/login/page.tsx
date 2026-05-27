"use client";

import { Suspense, useState, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  getMultiFactorResolver,
  type MultiFactorError,
  type MultiFactorResolver,
} from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MfaChallengeModal } from "@/components/auth/mfa-challenge-modal";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const { user, loading, signIn, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Wave 4.2: MFA challenge state. When sign-in throws
  // auth/multi-factor-auth-required, we grab the resolver and show
  // the challenge modal. After the user verifies (TOTP or recovery
  // code), the modal completes the credential or signals a recovery
  // retry; the page navigates the same way the no-MFA path does.
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(
    null,
  );
  const [mfaOpen, setMfaOpen] = useState(false);

  // Already-signed-in case: if the user lands here with valid auth, send them along.
  useEffect(() => {
    if (!loading && user) {
      router.replace(redirectTo || "/dashboard");
    }
  }, [user, loading, redirectTo, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Eager-navigate using the Firebase User returned directly by signIn,
      // instead of waiting for the auth context's onAuthStateChanged listener
      // to fire. The listener is unreliable on Safari (background-tab throttling
      // + slow Firestore profile/membership fetches), which caused users to
      // sit on the login form until they refreshed. The dashboard layout's
      // spinner absorbs the brief window while the auth context catches up.
      const signedInUser = await signIn(email, password);
      if (signedInUser) {
        router.replace(redirectTo || "/dashboard");
        return;
      }
      setSubmitting(false);
    } catch (err: unknown) {
      // MFA required → open challenge modal. NOT a sign-in failure;
      // clear the context error message so the user doesn't see a red
      // banner while we're still asking for their second factor.
      const errCode = (err as { code?: string })?.code;
      if (errCode === "auth/multi-factor-auth-required") {
        clearError();
        const resolver = getMultiFactorResolver(auth, err as MultiFactorError);
        setMfaResolver(resolver);
        setMfaOpen(true);
      }
      setSubmitting(false);
    }
  }

  async function handleMfaSuccess() {
    setMfaOpen(false);
    setMfaResolver(null);
    router.replace(redirectTo || "/dashboard");
  }

  async function handleRecoverySuccess() {
    // Server unenrolled MFA. Retry the original password sign-in;
    // this time no MultiFactorError will fire.
    setMfaOpen(false);
    setMfaResolver(null);
    setSubmitting(true);
    try {
      const signedInUser = await signIn(email, password);
      if (signedInUser) {
        router.replace(redirectTo || "/dashboard");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-vc-bg px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="mb-10 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-vc-indigo">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          </div>
          <span className="text-xl font-semibold text-vc-indigo">
            Volunteer<span className="text-vc-coral">Cal</span>
          </span>
        </Link>

        {/* Card */}
        <div className="rounded-2xl border border-vc-border-light bg-white p-8 shadow-xl shadow-black/[0.03]">
          <h1 className="font-display text-2xl text-vc-indigo">Welcome back</h1>
          <p className="mt-1 text-sm text-vc-text-secondary">
            Sign in to manage your volunteer schedule.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Input
              label="Email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.org"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) clearError();
              }}
            />
            <Input
              label="Password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) clearError();
              }}
            />

            <div className="flex justify-end">
              <Link
                href="/password-reset"
                className="text-sm font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            {error && (
              <div className="rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
                {error}
              </div>
            )}

            <Button type="submit" loading={submitting} className="w-full">
              Sign In
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-vc-text-muted">
          Don&apos;t have an account?{" "}
          <Link
            href={redirectTo ? `/register?redirect=${encodeURIComponent(redirectTo)}` : "/register"}
            className="font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
          >
            Create one
          </Link>
        </p>
      </div>

      <MfaChallengeModal
        open={mfaOpen}
        onClose={() => {
          setMfaOpen(false);
          setMfaResolver(null);
        }}
        resolver={mfaResolver}
        email={email}
        onSuccess={handleMfaSuccess}
        onRecoverySuccess={handleRecoverySuccess}
      />
    </div>
  );
}
