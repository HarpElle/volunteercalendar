"use client";

import { useState } from "react";
import {
  EmailAuthProvider,
  getMultiFactorResolver,
  reauthenticateWithCredential,
  TotpMultiFactorGenerator,
  type User,
  type MultiFactorError,
} from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unenrollAllFactors } from "@/lib/firebase/mfa";

/**
 * Disable-MFA confirmation modal.
 *
 * Per Wave 4.2 decisions: both current password AND current MFA code
 * are required to disable. Defeats a stolen-password attacker who
 * doesn't have the second factor. Industry standard (GitHub, Stripe).
 *
 * Flow:
 *   1. User submits password + TOTP code together
 *   2. We call reauthenticateWithCredential(password). Firebase will
 *      throw `auth/multi-factor-auth-required` because the user has
 *      MFA enrolled — we catch and complete the challenge with the
 *      submitted TOTP code via the resolver
 *   3. On reauth success, unenroll all TOTP factors via Firebase
 *   4. DELETE the server's recovery codes doc (emits the
 *      `auth.mfa_disabled` audit row)
 *   5. Close modal; parent refetches enrollment state
 */
export function MfaDisableModal({
  open,
  onClose,
  user,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  user: User;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setPassword("");
    setCode("");
    setLoading(false);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user.email) {
      setError("Account has no email — contact support.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const credential = EmailAuthProvider.credential(user.email, password);
      try {
        await reauthenticateWithCredential(user, credential);
      } catch (reauthErr: unknown) {
        const errCode = (reauthErr as { code?: string })?.code;
        if (errCode === "auth/multi-factor-auth-required") {
          const resolver = getMultiFactorResolver(
            auth,
            reauthErr as MultiFactorError,
          );
          const totpHint = resolver.hints.find((h) => h.factorId === "totp");
          if (!totpHint) {
            throw new Error("No TOTP factor found on this account.");
          }
          const assertion = TotpMultiFactorGenerator.assertionForSignIn(
            totpHint.uid,
            code.trim(),
          );
          await resolver.resolveSignIn(assertion);
        } else {
          throw reauthErr;
        }
      }

      // Reauth succeeded with both proofs. Unenroll Firebase factors,
      // then wipe server recovery codes (emits auth.mfa_disabled audit).
      await unenrollAllFactors(user);
      const token = await user.getIdToken();
      const res = await fetch("/api/account/mfa/recovery-codes", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // Best-effort: Firebase MFA is off, but server cleanup failed.
        // Surface so the user can ping support if it sticks; the actual
        // sign-in MFA gate is already lifted, so they're not locked out.
        const body = await res.json().catch(() => ({}));
        // Not blocking — but log it so they're not surprised.
        // eslint-disable-next-line no-console
        console.warn("Recovery codes cleanup failed:", body);
      }

      onSuccess();
      onClose();
      reset();
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code;
      if (errCode === "auth/wrong-password" || errCode === "auth/invalid-credential") {
        setError("Password is incorrect.");
      } else if (errCode === "auth/invalid-verification-code") {
        setError("That code didn't work. Try the next one your app shows.");
      } else if (errCode === "auth/too-many-requests") {
        setError("Too many attempts. Wait a few minutes and try again.");
      } else {
        setError((err as Error)?.message ?? "Could not disable MFA.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    onClose();
    reset();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Disable two-factor authentication"
      subtitle="Confirm with your password and a current code from your authenticator"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-vc-coral/30 bg-vc-coral/5 px-3 py-2 text-sm text-vc-coral-dark">
          Your account will be less secure. You can re-enable two-factor
          authentication at any time.
        </div>
        <Input
          label="Current password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <Input
          label="Code from your authenticator"
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
        />
        {error && <p className="text-sm text-vc-coral-dark">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={loading}
            disabled={!password || code.length !== 6}
          >
            Disable MFA
          </Button>
        </div>
      </form>
    </Modal>
  );
}
