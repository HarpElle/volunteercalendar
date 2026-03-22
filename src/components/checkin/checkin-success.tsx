"use client";

import { useEffect, useState } from "react";

interface CheckInResult {
  sessions: {
    id: string;
    child_id: string;
    room_name: string;
    checked_in_at: string;
  }[];
  security_code: string;
  label_payloads: { format: string; data: string; printer_id: string }[];
  print_server_url: string | null;
}

interface CheckInSuccessProps {
  result: CheckInResult;
  childNames: string[];
  onReset: () => void;
  onActivity: () => void;
}

/**
 * Screen 4: Success confirmation with security code display.
 * Shows large security code, print status, auto-resets after 8s.
 */
export function CheckInSuccess({
  result,
  childNames,
  onReset,
  onActivity,
}: CheckInSuccessProps) {
  const [printStatus, setPrintStatus] = useState<"sending" | "sent" | "failed" | "no_printer">(
    result.print_server_url ? "sending" : "no_printer",
  );
  const [countdown, setCountdown] = useState(8);

  // Send labels to companion print service
  useEffect(() => {
    if (!result.print_server_url || result.label_payloads.length === 0) return;

    const printLabels = async () => {
      try {
        for (const payload of result.label_payloads) {
          await fetch(`${result.print_server_url}/print`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
        setPrintStatus("sent");
      } catch {
        setPrintStatus("failed");
      }
    };

    printLabels();
  }, [result.print_server_url, result.label_payloads]);

  // Auto-reset countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onReset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onReset]);

  const handleRetryPrint = async () => {
    onActivity();
    if (!result.print_server_url) return;

    setPrintStatus("sending");
    try {
      for (const payload of result.label_payloads) {
        await fetch(`${result.print_server_url}/print`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setPrintStatus("sent");
    } catch {
      setPrintStatus("failed");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {/* Success icon */}
      <div className="w-20 h-20 rounded-full bg-vc-sage/20 flex items-center justify-center mb-6">
        <svg className="w-10 h-10 text-vc-sage" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-3xl font-bold text-vc-indigo font-display mb-2">
        Checked In!
      </h2>

      <p className="text-gray-500 text-lg mb-8">
        {childNames.join(", ")} {childNames.length === 1 ? "is" : "are"} all set
      </p>

      {/* Security code — large and prominent */}
      <div className="bg-white rounded-2xl border-2 border-vc-indigo/20 p-8 mb-6 text-center shadow-sm">
        <p className="text-sm text-gray-500 font-medium mb-2 uppercase tracking-wide">
          Security Code
        </p>
        <p className="text-5xl font-mono font-bold text-vc-indigo tracking-[0.3em]">
          {result.security_code}
        </p>
        <p className="text-sm text-gray-400 mt-3">
          You&apos;ll need this code for pickup
        </p>
      </div>

      {/* Room assignments */}
      <div className="flex flex-wrap gap-2 justify-center mb-6">
        {result.sessions.map((session, i) => (
          <span
            key={session.id}
            className="px-3 py-1.5 rounded-full bg-vc-indigo/5 text-sm font-medium text-vc-indigo"
          >
            {childNames[i]} → {session.room_name}
          </span>
        ))}
      </div>

      {/* Print status */}
      <div className="mb-8">
        {printStatus === "sending" && (
          <p className="text-gray-500 flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-gray-300 border-t-vc-coral rounded-full animate-spin" />
            Printing labels...
          </p>
        )}
        {printStatus === "sent" && (
          <p className="text-vc-sage font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Labels sent to printer
          </p>
        )}
        {printStatus === "failed" && (
          <button
            type="button"
            onClick={handleRetryPrint}
            className="text-red-600 font-medium underline"
          >
            Print failed — tap to retry
          </button>
        )}
        {printStatus === "no_printer" && (
          <p className="text-gray-400 text-sm">No printer configured</p>
        )}
      </div>

      {/* Auto-reset */}
      <button
        type="button"
        onClick={() => {
          onReset();
          onActivity();
        }}
        className="text-gray-400 text-sm"
      >
        Screen resets in {countdown}s — tap to start over
      </button>
    </div>
  );
}
