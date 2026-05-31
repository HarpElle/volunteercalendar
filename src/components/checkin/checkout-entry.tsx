"use client";

import { useRef, useState } from "react";
import { kioskFetch } from "@/lib/kiosk-client";
import { BlockedPickupReview } from "./blocked-pickup-review";
import { BlockedPickupAlert } from "./blocked-pickup-alert";
import type { BlockedPickup } from "@/lib/types";

interface CheckoutEntryProps {
  churchId: string;
  churchName?: string;
  onSuccess: (result: CheckoutResult) => void;
  onBack: () => void;
  onActivity: () => void;
}

export interface CheckoutResult {
  children: { child_name: string; room_name: string }[];
  checked_out_at: string;
}

interface BlockListPreview {
  blocks: BlockedPickup[];
  children: { child_name: string; room_name?: string | null }[];
  securityCode: string;
}

interface BlockedAttemptResult {
  name: string;
  fanout: { attempted: number; success: number; failed: number };
}

/**
 * Kiosk checkout screen — parent enters 4-character security code.
 * Large touch-friendly input grid.
 */
export function CheckoutEntry({
  churchId,
  churchName,
  onSuccess,
  onBack,
  onActivity,
}: CheckoutEntryProps) {
  const [code, setCode] = useState<string[]>(["", "", "", ""]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Wave 9 P0-2 sub-PR F: block-list review state. When the entered
  // security code matches sessions with active block-list entries, the
  // operator sees the review modal before any checkout call.
  const [blockListPreview, setBlockListPreview] =
    useState<BlockListPreview | null>(null);
  const [blockedAttempt, setBlockedAttempt] =
    useState<BlockedAttemptResult | null>(null);

  const handleInput = (index: number, value: string) => {
    onActivity();
    const char = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(-1);
    const newCode = [...code];
    newCode[index] = char;
    setCode(newCode);
    setError("");

    // Auto-advance to next input
    if (char && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 4 characters entered
    if (char && index === 3 && newCode.every((c) => c)) {
      handleSubmit(newCode.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const proceedWithCheckout = async (securityCode: string) => {
    setSubmitting(true);
    setError("");
    onActivity();
    try {
      const res = await kioskFetch("/api/checkin/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          church_id: churchId,
          security_code: securityCode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "code_expired") {
          setError("Security code has expired. Please see a staff member.");
        } else if (data.error === "code_mismatch") {
          setError("Code doesn't match. Check your receipt and try again.");
        } else if (data.error === "no_active_sessions") {
          setError(
            "No children found with this code. They may already be checked out.",
          );
        } else {
          setError(data.message || data.error || "Checkout failed");
        }
        setCode(["", "", "", ""]);
        inputRefs.current[0]?.focus();
        return;
      }

      onSuccess({
        children:
          data.children || [
            { child_name: data.child_name, room_name: data.room_name },
          ],
        checked_out_at: data.checked_out_at,
      });
    } catch {
      setError("Network error. Please try again.");
      setCode(["", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (codeStr?: string) => {
    const securityCode = codeStr || code.join("");
    if (securityCode.length !== 4) {
      setError("Please enter all 4 characters");
      return;
    }

    setSubmitting(true);
    setError("");
    onActivity();

    // Wave 9 P0-2 sub-PR F: check the block list BEFORE attempting
    // checkout. If any active blocks apply to the children behind this
    // code, show the operator the review modal.
    try {
      const previewRes = await kioskFetch("/api/checkin/blocked-pickups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          church_id: churchId,
          security_code: securityCode,
        }),
      });
      if (previewRes.ok) {
        const previewData = (await previewRes.json()) as {
          blocks: BlockedPickup[];
          children: { child_name: string; room_name?: string | null }[];
        };
        if (previewData.blocks && previewData.blocks.length > 0) {
          setBlockListPreview({
            blocks: previewData.blocks,
            children: previewData.children ?? [],
            securityCode,
          });
          setSubmitting(false);
          return;
        }
      }
      // No blocks (or the preview endpoint failed — fail-open: proceed
      // with checkout. The preview is a SAFETY ASSIST, not a SAFETY GATE.
      // The server-side checkout endpoint is the source of truth for
      // release authorization; this UI step gives the operator a chance
      // to detect attempted blocked pickups, but a network failure here
      // shouldn't strand parents who have valid security codes).
    } catch {
      // Preview failed — proceed with checkout. See fail-open note above.
    }

    await proceedWithCheckout(securityCode);
  };

  const handleConfirmNotOnList = async () => {
    if (!blockListPreview) return;
    const { securityCode } = blockListPreview;
    setBlockListPreview(null);
    await proceedWithCheckout(securityCode);
  };

  const handleAttempt = async (blockedPickupId: string) => {
    if (!blockListPreview) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await kioskFetch(
        "/api/checkin/blocked-pickup-attempt",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            church_id: churchId,
            security_code: blockListPreview.securityCode,
            blocked_pickup_id: blockedPickupId,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Could not record attempt");
        return;
      }
      const matchedBlock = blockListPreview.blocks.find(
        (b) => b.id === blockedPickupId,
      );
      setBlockedAttempt({
        name: matchedBlock?.name ?? "Person on the block list",
        fanout: data.fanout ?? { attempted: 0, success: 0, failed: 0 },
      });
      setBlockListPreview(null);
    } catch {
      setError("Network error recording attempt. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAlertDismiss = () => {
    setBlockedAttempt(null);
    setCode(["", "", "", ""]);
    onBack();
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="max-w-md w-full text-center">
        {churchName && (
          <p className="text-lg text-vc-text-secondary font-medium mb-1">{churchName}</p>
        )}
        <h1 className="text-3xl font-bold text-vc-indigo font-display mb-2">
          Check Out
        </h1>
        <p className="text-gray-500 mb-8">
          Enter the 4-character security code from your receipt
        </p>

        {/* Code input grid */}
        <div className="flex justify-center gap-4 mb-6">
          {code.map((char, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              maxLength={1}
              value={char}
              onChange={(e) => handleInput(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onFocus={onActivity}
              disabled={submitting}
              className="w-20 h-24 text-4xl font-bold text-center text-vc-indigo
                border-2 border-gray-200 rounded-2xl
                focus:border-vc-coral focus:ring-2 focus:ring-vc-coral/20 outline-none
                transition-colors uppercase
                disabled:opacity-50 disabled:bg-gray-50"
              autoFocus={i === 0}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-6 text-sm font-medium">
            {error}
          </div>
        )}

        {/* Loading state */}
        {submitting && (
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-5 h-5 border-2 border-vc-coral/30 border-t-vc-coral rounded-full animate-spin" />
            <span className="text-gray-500">Verifying code...</span>
          </div>
        )}

        {/* Back button */}
        <button
          type="button"
          onClick={onBack}
          className="text-gray-400 hover:text-vc-indigo transition-colors font-medium"
        >
          &larr; Back to Check-In
        </button>
      </div>

      {/* Wave 9 P0-2 sub-PR F: block-list review + blocked-attempt alert */}
      {blockListPreview && (
        <BlockedPickupReview
          blocks={blockListPreview.blocks}
          childPreview={blockListPreview.children}
          onConfirmNotOnList={handleConfirmNotOnList}
          onAttempt={handleAttempt}
          onCancel={() => {
            setBlockListPreview(null);
            setCode(["", "", "", ""]);
          }}
          submitting={submitting}
        />
      )}
      {blockedAttempt && (
        <BlockedPickupAlert
          blockedPickupName={blockedAttempt.name}
          fanout={blockedAttempt.fanout}
          onDismiss={handleAlertDismiss}
        />
      )}
    </div>
  );
}
