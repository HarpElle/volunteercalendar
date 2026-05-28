"use client";

import { useEffect, useState } from "react";
import { sendEmailVerification, type User } from "firebase/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isMfaEnabled } from "@/lib/firebase/mfa";
import { MfaSetupModal } from "./mfa-setup-modal";
import { MfaDisableModal } from "./mfa-disable-modal";
import { RecoveryCodesDisplay } from "./recovery-codes-display";

/**
 * Two-Factor Authentication card for /dashboard/account.
 *
 * Self-contained: holds its own modal state (setup wizard, disable
 * confirmation, regenerate flow) and re-reads enrollment status from
 * the Firebase user after each successful action.
 *
 * Per Wave 4.2 decisions:
 *   - Free for everyone (no tier gate UI)
 *   - TOTP only (no SMS option)
 *   - Recovery codes mandatory; setup modal blocks the user from
 *     completing without confirming they saved the codes
 *   - Disable requires password + current MFA code
 *   - Regenerate is one click but confirms it invalidates the old set
 */
export function MfaSettingsCard({ user }: { user: User }) {
  const [enrolled, setEnrolled] = useState(false);
  const [emailVerified, setEmailVerified] = useState(user.emailVerified);
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState("");
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);
  const [verifyEmailSending, setVerifyEmailSending] = useState(false);
  const [verifyEmailSent, setVerifyEmailSent] = useState(false);
  const [verifyEmailError, setVerifyEmailError] = useState("");

  useEffect(() => {
    // Read on mount + whenever we close a modal that might have flipped state.
    // Reload the user first so Firebase's `emailVerified` reflects any
    // recently-clicked verification link without a full sign-out cycle.
    let cancelled = false;
    async function refresh() {
      try {
        await user.reload();
      } catch {
        // network hiccup is fine; fall back to cached state
      }
      if (cancelled) return;
      setEnrolled(isMfaEnabled(user));
      setEmailVerified(user.emailVerified);
    }
    refresh();
    return () => {
      cancelled = true;
    };
  }, [user, showSetup, showDisable]);

  // Wave 5 Batch A: Firebase requires email verification before TOTP
  // enrollment can begin. Surface this as a proactive prompt rather than
  // letting the user click Enable, scan the QR, and only THEN hit an
  // opaque auth/unverified-email error. The "Send verification email"
  // button uses Firebase Auth's native sendEmailVerification; after the
  // user clicks the link in their inbox they refresh / re-mount the page
  // and the gate clears (because `user.reload()` re-reads emailVerified).
  async function handleSendVerificationEmail() {
    setVerifyEmailSending(true);
    setVerifyEmailError("");
    setVerifyEmailSent(false);
    try {
      await sendEmailVerification(user);
      setVerifyEmailSent(true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/too-many-requests") {
        setVerifyEmailError(
          "Verification email was sent recently. Check your inbox + spam folder, then try again in a few minutes.",
        );
      } else {
        setVerifyEmailError(
          (err as Error)?.message ?? "Could not send verification email.",
        );
      }
    } finally {
      setVerifyEmailSending(false);
    }
  }

  async function handleRegenerate() {
    if (
      !confirm(
        "Generate fresh recovery codes? Your existing codes will stop working immediately. Use this if you've lost track of where you stored them.",
      )
    ) {
      return;
    }
    setRegenLoading(true);
    setRegenError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/mfa/recovery-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "regenerate" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to regenerate");
      }
      const data = (await res.json()) as { codes: string[] };
      setFreshCodes(data.codes);
    } catch (err) {
      setRegenError((err as Error).message ?? "Could not regenerate codes.");
    } finally {
      setRegenLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-vc-border-light bg-white p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-vc-indigo">
              Two-factor authentication
            </h3>
            {enrolled ? (
              <Badge variant="success">Enabled</Badge>
            ) : (
              <Badge variant="default">Off</Badge>
            )}
          </div>
          <p className="mt-1.5 max-w-prose text-sm text-vc-text-secondary">
            {enrolled
              ? "Sign-in requires a 6-digit code from your authenticator app. Use a recovery code if you lose your device."
              : "Protect your account with a one-time code from any authenticator app (Google Authenticator, 1Password, Authy)."}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
          {!enrolled ? (
            <Button
              size="sm"
              onClick={() => setShowSetup(true)}
              disabled={!emailVerified}
              title={
                !emailVerified
                  ? "Verify your email address first"
                  : undefined
              }
            >
              Enable
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRegenerate}
                loading={regenLoading}
              >
                Regenerate codes
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowDisable(true)}
              >
                Disable
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Wave 5 Batch A: email-verification guardrail. Firebase rejects
          TOTP enrollment with auth/unverified-email when the account
          hasn't verified its email; this prompt makes that prerequisite
          explicit + offers a one-click send-verification action. */}
      {!enrolled && !emailVerified && (
        <div className="mt-4 rounded-xl border border-vc-coral/30 bg-vc-coral/5 px-4 py-3">
          <p className="text-sm font-medium text-vc-coral-dark">
            Verify your email address first
          </p>
          <p className="mt-1 text-sm text-vc-text-secondary">
            Two-factor authentication requires a verified email. Click the
            verification link we send you, then come back to this page.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendVerificationEmail}
              loading={verifyEmailSending}
              disabled={verifyEmailSent}
            >
              {verifyEmailSent ? "Email sent" : "Send verification email"}
            </Button>
            {verifyEmailSent && (
              <span className="text-xs text-vc-text-muted">
                Check {user.email ?? "your inbox"}. Refresh after clicking the
                link.
              </span>
            )}
          </div>
          {verifyEmailError && (
            <p className="mt-2 text-sm text-vc-coral-dark">{verifyEmailError}</p>
          )}
        </div>
      )}

      {regenError && (
        <p className="mt-3 text-sm text-vc-coral-dark">{regenError}</p>
      )}

      {freshCodes && (
        <div className="mt-5 space-y-3 border-t border-vc-border-light pt-5">
          <div className="rounded-lg border border-vc-coral/30 bg-vc-coral/5 px-3 py-2 text-sm text-vc-coral-dark">
            <p className="font-semibold">
              These codes will not be shown again.
            </p>
            <p className="mt-1">
              Save them somewhere safe — they replace any previous set.
            </p>
          </div>
          <RecoveryCodesDisplay codes={freshCodes} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFreshCodes(null)}
          >
            I&apos;ve saved them
          </Button>
        </div>
      )}

      <MfaSetupModal
        open={showSetup}
        onClose={() => setShowSetup(false)}
        user={user}
        onSuccess={() => setEnrolled(isMfaEnabled(user))}
      />
      <MfaDisableModal
        open={showDisable}
        onClose={() => setShowDisable(false)}
        user={user}
        onSuccess={() => {
          setEnrolled(isMfaEnabled(user));
          setFreshCodes(null);
        }}
      />
    </div>
  );
}
