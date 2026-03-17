"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PasswordResetPage() {
  const { resetPassword, error, clearError, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await resetPassword(email);
      setSent(true);
    } catch {
      // error is set in context
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
            Volunteer<span className="text-vc-coral">Calendar</span>
          </span>
        </Link>

        {/* Card */}
        <div className="rounded-2xl border border-vc-border-light bg-white p-8 shadow-xl shadow-black/[0.03]">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-vc-sage/10">
                <svg className="h-7 w-7 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              </div>
              <h1 className="font-display text-2xl text-vc-indigo">Check your email</h1>
              <p className="mt-2 text-sm text-vc-text-secondary">
                We sent a password reset link to <strong className="text-vc-indigo">{email}</strong>.
                Check your inbox and follow the instructions.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-block text-sm font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-display text-2xl text-vc-indigo">Reset your password</h1>
              <p className="mt-1 text-sm text-vc-text-secondary">
                Enter your email and we&apos;ll send you a reset link.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <Input
                  label="Email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@church.org"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) clearError();
                  }}
                />

                {error && (
                  <div className="rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
                    {error}
                  </div>
                )}

                <Button type="submit" loading={loading} className="w-full">
                  Send Reset Link
                </Button>
              </form>
            </>
          )}
        </div>

        {!sent && (
          <p className="mt-6 text-center text-sm text-vc-text-muted">
            Remember your password?{" "}
            <Link
              href="/login"
              className="font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
            >
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
