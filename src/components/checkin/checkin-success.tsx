"use client";

import { useCallback, useEffect, useState } from "react";
import {
  printLabels as printVia,
  detectPrintPath,
  type KioskPrinterConfig,
} from "@/lib/services/kiosk-print-bridge";

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
  printer_config?: KioskPrinterConfig | null;
}

interface CheckInSuccessProps {
  result: CheckInResult;
  childNames: string[];
  churchName?: string;
  onReset: () => void;
  onActivity: () => void;
  onSetupPrinter?: () => void;
}

/**
 * Screen 4: Success confirmation with security code display.
 * Shows large security code, print status, auto-resets after 8s.
 *
 * Printing routes through the kiosk print bridge:
 *   Capacitor native → Brother SDK (silent) or AirPrint
 *   Web + print_server_url → LAN print server
 *   Otherwise → "No printer configured"
 */
export function CheckInSuccess({
  result,
  childNames,
  churchName,
  onReset,
  onActivity,
  onSetupPrinter,
}: CheckInSuccessProps) {
  const printPath = detectPrintPath(
    result.printer_config,
    result.print_server_url,
  );
  const hasPrinter = printPath !== "none";

  const [printStatus, setPrintStatus] = useState<
    "sending" | "sent" | "failed" | "no_printer"
  >(hasPrinter && result.label_payloads.length > 0 ? "sending" : "no_printer");
  const [countdown, setCountdown] = useState(8);

  // Send labels via the print bridge
  useEffect(() => {
    if (!hasPrinter || result.label_payloads.length === 0) return;

    const doPrint = async () => {
      const res = await printVia(
        result.label_payloads,
        result.printer_config,
        result.print_server_url,
      );
      setPrintStatus(res.success ? "sent" : "failed");
    };

    doPrint();
  }, [hasPrinter, result.label_payloads, result.printer_config, result.print_server_url]);

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

  const handleRetryPrint = useCallback(async () => {
    onActivity();
    setPrintStatus("sending");
    const res = await printVia(
      result.label_payloads,
      result.printer_config,
      result.print_server_url,
    );
    setPrintStatus(res.success ? "sent" : "failed");
  }, [onActivity, result.label_payloads, result.printer_config, result.print_server_url]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      {/* Success icon */}
      <div className="w-20 h-20 rounded-full bg-vc-sage/20 flex items-center justify-center mb-6">
        <svg className="w-10 h-10 text-vc-sage" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      {churchName && (
        <p className="text-sm text-vc-text-secondary font-medium mb-1">{churchName}</p>
      )}
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
        {printStatus === "no_printer" && onSetupPrinter && (
          <button
            type="button"
            onClick={() => { onSetupPrinter(); onActivity(); }}
            className="flex items-center gap-2 text-vc-coral text-sm font-medium hover:underline"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
            </svg>
            Set Up Printer
          </button>
        )}
        {printStatus === "no_printer" && !onSetupPrinter && (
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
