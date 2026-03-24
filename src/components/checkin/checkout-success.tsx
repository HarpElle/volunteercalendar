"use client";

import { useEffect, useState } from "react";
import type { CheckoutResult } from "./checkout-entry";

interface CheckoutSuccessProps {
  result: CheckoutResult;
  onReset: () => void;
  onActivity: () => void;
}

const AUTO_RESET_SECONDS = 10;

/**
 * Kiosk checkout success screen.
 * Shows names of released children + auto-reset countdown.
 */
export function CheckoutSuccess({
  result,
  onReset,
  onActivity,
}: CheckoutSuccessProps) {
  const [countdown, setCountdown] = useState(AUTO_RESET_SECONDS);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onReset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onReset]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="max-w-md w-full text-center">
        {/* Success checkmark */}
        <div className="w-20 h-20 rounded-full bg-vc-sage/20 flex items-center justify-center mx-auto mb-6">
          <svg
            className="h-10 w-10 text-vc-sage"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m4.5 12.75 6 6 9-13.5"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-vc-indigo font-display mb-2">
          Checked Out
        </h1>
        <p className="text-gray-500 mb-6">
          The following children have been released:
        </p>

        {/* Children list */}
        <div className="space-y-2 mb-8">
          {result.children.map((child, i) => (
            <div
              key={i}
              className="bg-vc-bg-warm border border-vc-border-light rounded-xl px-5 py-3"
            >
              <p className="font-semibold text-vc-indigo">{child.child_name}</p>
              <p className="text-sm text-gray-500">{child.room_name}</p>
            </div>
          ))}
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Returning to home in {countdown}s
        </p>

        <button
          type="button"
          onClick={() => {
            onActivity();
            onReset();
          }}
          className="text-vc-coral font-semibold hover:underline"
        >
          Done
        </button>
      </div>
    </div>
  );
}
