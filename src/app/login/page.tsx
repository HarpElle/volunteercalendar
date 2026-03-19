"use client";

import { Suspense, useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const pendingRedirect = useRef(false);

  // Navigate only after auth context confirms the user is set
  useEffect(() => {
    if (pendingRedirect.current && !loading && user) {
      router.replace(redirectTo || "/dashboard");
    }
  }, [user, loading, redirectTo, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email, password);
      pendingRedirect.current = true;
    } catch {
      // error is set in context
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
    </div>
  );
}
