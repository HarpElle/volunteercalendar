"use client";

import { useRef, useState } from "react";

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

  const handleSubmit = async (codeStr?: string) => {
    const securityCode = codeStr || code.join("");
    if (securityCode.length !== 4) {
      setError("Please enter all 4 characters");
      return;
    }

    setSubmitting(true);
    setError("");
    onActivity();

    try {
      const res = await fetch("/api/checkin/checkout", {
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
          setError("No children found with this code. They may already be checked out.");
        } else {
          setError(data.message || data.error || "Checkout failed");
        }
        setCode(["", "", "", ""]);
        inputRefs.current[0]?.focus();
        return;
      }

      onSuccess({
        children: data.children || [{ child_name: data.child_name, room_name: data.room_name }],
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
    </div>
  );
}
