"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const prefillEmail = searchParams.get("email") || "";
  const { signUp, error, clearError, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError("");

    if (password !== confirmPassword) {
      setLocalError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setLocalError("Password must be at least 6 characters.");
      return;
    }

    try {
      await signUp(email, password, name);
      // Fire-and-forget welcome email
      fetch("/api/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      }).catch(() => {});
      router.push(redirectTo || "/dashboard");
    } catch {
      // error is set in context
    }
  }

  const displayError = localError || error;

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
          <h1 className="font-display text-2xl text-vc-indigo">Create your account</h1>
          <p className="mt-1 text-sm text-vc-text-secondary">
            Start scheduling your organization&apos;s volunteers in minutes.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Input
              label="Full Name"
              type="text"
              required
              autoComplete="name"
              placeholder="Jason Paschall"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) clearError();
                setLocalError("");
              }}
            />
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
                setLocalError("");
              }}
            />
            <Input
              label="Password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) clearError();
                setLocalError("");
              }}
            />
            <Input
              label="Confirm Password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setLocalError("");
              }}
            />

            {displayError && (
              <div className="rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
                {displayError}
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full">
              Create Account
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-vc-text-muted">
          Already have an account?{" "}
          <Link
            href={redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login"}
            className="font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
