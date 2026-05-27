"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Reusable display for a fresh set of recovery codes.
 *
 * Shows the plaintext codes in a 2-column grid, plus Copy All and
 * Download buttons. The plaintext exists only for the lifetime of
 * this React tree — once unmounted, the codes are gone (the server
 * never returns them again).
 *
 * Used in both the enrollment wizard (step 3) and the regenerate
 * confirmation flow. Caller wraps it in whatever modal/page chrome
 * makes sense.
 */
export function RecoveryCodesDisplay({
  codes,
  downloadFilename = "volunteercal-recovery-codes.txt",
}: {
  codes: string[];
  downloadFilename?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopyAll() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail in non-secure contexts or denied
      // permissions; the download button is the always-works fallback.
    }
  }

  function handleDownload() {
    const content = [
      "VolunteerCal — Recovery Codes",
      "",
      "Keep these somewhere safe. Each code works once.",
      "If you lose access to your authenticator, use one of these",
      "during sign-in to disable MFA and regain access.",
      "",
      "Generated: " + new Date().toISOString(),
      "",
      ...codes,
      "",
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-4">
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {codes.map((code) => (
            <li
              key={code}
              className="font-mono text-sm text-vc-indigo tracking-wider"
            >
              {code}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={handleCopyAll}>
          {copied ? "Copied!" : "Copy all"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleDownload}>
          Download .txt
        </Button>
      </div>
    </div>
  );
}
