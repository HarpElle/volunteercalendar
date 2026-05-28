"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { User } from "firebase/auth";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  beginTotpEnrollment,
  completeTotpEnrollment,
} from "@/lib/firebase/mfa";
import { RecoveryCodesDisplay } from "./recovery-codes-display";

type Step = "scan" | "verify" | "recovery";

/**
 * 3-step MFA enrollment wizard.
 *
 *   1. scan      → QR code + manual secret fallback
 *   2. verify    → user enters 6-digit code from authenticator
 *   3. recovery  → 8 plaintext codes shown ONCE; checkbox gate before
 *                  the modal can close
 *
 * Per Wave 4.2 decisions: codes are force-confirmed (checkbox must
 * be checked before "Done" enables). Closing the modal early without
 * confirming triggers a warning toast — but doesn't roll back the
 * enrollment (Firebase MFA is already set + codes are already
 * persisted by the time we get here).
 */
export function MfaSetupModal({
  open,
  onClose,
  user,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  user: User;
  /** Called after the user confirms saving their recovery codes. */
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<Step>("scan");
  const [secret, setSecret] = useState<Awaited<
    ReturnType<typeof beginTotpEnrollment>
  >["secret"] | null>(null);
  const [qrUrl, setQrUrl] = useState<string>("");
  const [manualSecret, setManualSecret] = useState<string>("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset state every time the modal opens fresh.
  function resetState() {
    setStep("scan");
    setSecret(null);
    setQrUrl("");
    setManualSecret("");
    setCode("");
    setRecoveryCodes([]);
    setSavedConfirmed(false);
    setLoading(false);
    setError("");
  }

  async function handleStartEnrollment() {
    setLoading(true);
    setError("");
    try {
      const result = await beginTotpEnrollment(user);
      setSecret(result.secret);
      setQrUrl(result.qrCodeUrl);
      setManualSecret(result.manualSecret);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      const message = (err as { message?: string })?.message ?? "";
      if (code === "auth/requires-recent-login") {
        setError(
          "For security, please sign out and sign back in, then try enabling MFA again.",
        );
      } else if (
        code === "auth/unverified-email" ||
        // Firebase sometimes returns auth/operation-not-allowed with the
        // string "Unverified email" embedded — surface the same hint.
        message.toLowerCase().includes("unverified email")
      ) {
        setError(
          "Verify your email address first. Close this dialog and use the 'Send verification email' button on the Security card.",
        );
      } else if (code === "auth/operation-not-allowed") {
        // Distinct copy from the unverified-email case: this is a
        // project-level config gap (TOTP MFA not enabled on the
        // Firebase project). Should never happen in production but
        // surfaces a clear next step if it does.
        setError(
          "Two-factor authentication isn't enabled on this project. Contact support.",
        );
      } else {
        setError(message || "Could not start MFA setup.");
      }
    } finally {
      setLoading(false);
    }
  }

  // Kick off enrollment the first time the modal opens.
  if (open && !secret && !loading && !error) {
    void handleStartEnrollment();
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!secret) return;
    setLoading(true);
    setError("");
    try {
      await completeTotpEnrollment(user, secret, code);
      // Firebase enrollment landed — now mint recovery codes server-side.
      const token = await user.getIdToken();
      const res = await fetch("/api/account/mfa/recovery-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "enroll" }),
      });
      if (!res.ok) {
        // Edge case: Firebase MFA is enrolled but recovery codes failed.
        // Tell the user; they can regenerate from the settings card.
        throw new Error(
          "MFA is enabled but we couldn't generate recovery codes. Try regenerating them from the security card.",
        );
      }
      const data = (await res.json()) as { codes: string[] };
      setRecoveryCodes(data.codes);
      setStep("recovery");
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/invalid-verification-code") {
        setError("That code didn't work. Try the next one your app shows.");
      } else {
        setError((err as Error)?.message ?? "Could not enable MFA.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (step === "recovery" && !savedConfirmed) {
      if (
        !confirm(
          "Close without confirming you saved the recovery codes? You won't see them again. You can regenerate codes from the security card later if needed.",
        )
      ) {
        return;
      }
    }
    onClose();
    onSuccess();
    resetState();
  }

  function handleFinish() {
    onSuccess();
    onClose();
    resetState();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        step === "scan"
          ? "Set up two-factor authentication"
          : step === "verify"
            ? "Verify your authenticator"
            : "Save your recovery codes"
      }
      subtitle={
        step === "scan"
          ? "Step 1 of 3 — scan the QR code with your authenticator app"
          : step === "verify"
            ? "Step 2 of 3 — enter the 6-digit code your app shows"
            : "Step 3 of 3 — store these codes somewhere safe"
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-vc-coral/30 bg-vc-coral/5 px-3 py-2 text-sm text-vc-coral-dark">
          {error}
        </div>
      )}

      {step === "scan" && (
        <div className="space-y-5">
          <p className="text-sm text-vc-text-secondary">
            Use any authenticator app (Google Authenticator, 1Password, Authy,
            Microsoft Authenticator). Scan this code with your app.
          </p>

          {qrUrl ? (
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-xl border border-vc-border-light bg-white p-4">
                <QRCodeSVG value={qrUrl} size={192} level="M" />
              </div>
              <details className="w-full">
                <summary className="cursor-pointer text-sm text-vc-text-muted hover:text-vc-indigo">
                  Can&apos;t scan? Enter this code manually
                </summary>
                <p className="mt-2 break-all rounded-lg bg-vc-bg-warm px-3 py-2 font-mono text-sm text-vc-indigo">
                  {manualSecret}
                </p>
              </details>
            </div>
          ) : (
            <p className="text-sm text-vc-text-muted">
              {loading ? "Generating QR code…" : "Preparing setup…"}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={() => setStep("verify")}
              disabled={!secret || loading}
            >
              I&apos;ve scanned the code
            </Button>
          </div>
        </div>
      )}

      {step === "verify" && (
        <form onSubmit={handleVerifyCode} className="space-y-5">
          <p className="text-sm text-vc-text-secondary">
            Enter the 6-digit code your authenticator app is currently showing.
          </p>
          <Input
            label="Verification code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            maxLength={6}
            required
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep("scan")}
              disabled={loading}
            >
              Back
            </Button>
            <Button type="submit" loading={loading} disabled={code.length !== 6}>
              Verify &amp; enable
            </Button>
          </div>
        </form>
      )}

      {step === "recovery" && (
        <div className="space-y-5">
          <div className="rounded-lg border border-vc-coral/30 bg-vc-coral/5 px-4 py-3 text-sm text-vc-coral-dark">
            <p className="font-semibold">
              These codes will not be shown again.
            </p>
            <p className="mt-1">
              If you lose your phone, use one of these codes during sign-in to
              regain access. Each code works once.
            </p>
          </div>

          <RecoveryCodesDisplay codes={recoveryCodes} />

          <label className="flex items-start gap-2 text-sm text-vc-text-secondary">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-vc-border-light text-vc-coral focus:ring-vc-coral"
              checked={savedConfirmed}
              onChange={(e) => setSavedConfirmed(e.target.checked)}
            />
            <span>
              I&apos;ve saved these codes somewhere safe (password manager,
              printed sheet, encrypted note).
            </span>
          </label>

          <div className="flex justify-end">
            <Button onClick={handleFinish} disabled={!savedConfirmed}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
