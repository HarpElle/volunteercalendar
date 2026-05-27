"use client";

import { useState } from "react";
import {
  TotpMultiFactorGenerator,
  type MultiFactorResolver,
  type UserCredential,
} from "firebase/auth";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Sign-in MFA challenge modal (Wave 4.2).
 *
 * Opened by the login page when signIn throws
 * `auth/multi-factor-auth-required`. Two modes:
 *
 *   - Default: 6-digit TOTP from the user's authenticator
 *   - Fallback: recovery code (single-use; disables MFA on success)
 *
 * The recovery-code path POSTs to /api/account/mfa/verify-recovery-code
 * which marks the code used + unenrolls Firebase MFA server-side. The
 * caller then retries the original sign-in (now without MFA challenge).
 *
 * Props:
 *   - resolver: from getMultiFactorResolver after the MultiFactorError
 *   - email: the email the user just submitted (needed for the recovery
 *     fallback endpoint, which is unauthenticated)
 *   - onSuccess: passed the completed UserCredential. Caller navigates.
 *   - onRecoverySuccess: called after recovery code succeeds. Caller
 *     should re-attempt signIn with the original password (MFA is now
 *     disabled server-side).
 */
export function MfaChallengeModal({
  open,
  onClose,
  resolver,
  email,
  onSuccess,
  onRecoverySuccess,
}: {
  open: boolean;
  onClose: () => void;
  resolver: MultiFactorResolver | null;
  email: string;
  onSuccess: (credential: UserCredential) => void;
  onRecoverySuccess: () => void;
}) {
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setMode("totp");
    setCode("");
    setRecoveryCode("");
    setLoading(false);
    setError("");
  }

  function handleClose() {
    onClose();
    reset();
  }

  async function handleVerifyTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!resolver) {
      setError("Sign-in session expired. Please try again.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const hint = resolver.hints.find((h) => h.factorId === "totp");
      if (!hint) {
        throw new Error("No TOTP factor enrolled.");
      }
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(
        hint.uid,
        code.trim(),
      );
      const credential = await resolver.resolveSignIn(assertion);
      onSuccess(credential);
      reset();
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code;
      if (errCode === "auth/invalid-verification-code") {
        setError("That code didn't work. Try the next one your app shows.");
      } else {
        setError((err as Error)?.message ?? "Could not verify code.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyRecovery(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/account/mfa/verify-recovery-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: recoveryCode }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Recovery code not recognized.");
      }
      // Server unenrolled MFA. Tell parent to retry sign-in.
      onRecoverySuccess();
      reset();
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Could not verify recovery code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        mode === "totp"
          ? "Two-factor authentication"
          : "Use a recovery code"
      }
      subtitle={
        mode === "totp"
          ? "Enter the 6-digit code from your authenticator"
          : "Each code works once. Using one will disable MFA — you can re-enable it from your account."
      }
      maxWidth="max-w-md"
    >
      {mode === "totp" ? (
        <form onSubmit={handleVerifyTotp} className="space-y-4">
          <Input
            label="Verification code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="123456"
            maxLength={6}
            required
            autoFocus
          />
          {error && <p className="text-sm text-vc-coral-dark">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-sm text-vc-text-muted underline hover:text-vc-indigo"
              onClick={() => {
                setMode("recovery");
                setError("");
              }}
            >
              Lost your phone? Use a recovery code
            </button>
            <Button type="submit" loading={loading} disabled={code.length !== 6}>
              Verify
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerifyRecovery} className="space-y-4">
          <Input
            label="Recovery code"
            type="text"
            autoComplete="off"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            placeholder="XXXXX-XXXXX"
            required
            autoFocus
          />
          <p className="text-xs text-vc-text-muted">
            Codes are case-insensitive. Spaces and dashes are okay.
          </p>
          {error && <p className="text-sm text-vc-coral-dark">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-sm text-vc-text-muted underline hover:text-vc-indigo"
              onClick={() => {
                setMode("totp");
                setError("");
              }}
            >
              Back to authenticator code
            </button>
            <Button
              type="submit"
              loading={loading}
              disabled={recoveryCode.trim().length < 8}
            >
              Use recovery code
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
