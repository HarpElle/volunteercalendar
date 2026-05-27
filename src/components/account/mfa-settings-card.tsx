"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
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
  const [showSetup, setShowSetup] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState("");
  const [freshCodes, setFreshCodes] = useState<string[] | null>(null);

  useEffect(() => {
    // Read on mount + whenever we close a modal that might have flipped state
    setEnrolled(isMfaEnabled(user));
  }, [user, showSetup, showDisable]);

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
            <Button size="sm" onClick={() => setShowSetup(true)}>
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
