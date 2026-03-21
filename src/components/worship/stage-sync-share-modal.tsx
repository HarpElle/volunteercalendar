"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/context/auth-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StageSyncShareModalProps {
  open: boolean;
  onClose: () => void;
  churchId: string;
  planId: string;
  planTitle?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StageSyncShareModal({
  open,
  onClose,
  churchId,
  planId,
  planTitle,
}: StageSyncShareModalProps) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    access_token: string;
    conductor_url: string;
    participant_url: string;
  } | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ---- Enable Stage Sync ----

  async function enableSync() {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/stage-sync/enable", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ church_id: churchId, plan_id: planId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to enable Stage Sync");
      }

      const data = await res.json();
      setResult(data);

      // Generate QR code for participant URL
      const participantFullUrl = `${window.location.origin}${data.participant_url}`;
      const dataUrl = await QRCode.toDataURL(participantFullUrl, {
        width: 250,
        margin: 2,
        color: { dark: "#2D3047", light: "#FEFCF9" },
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleCopyLink() {
    if (!result) return;
    const url = `${window.location.origin}${result.participant_url}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setResult(null);
    setQrDataUrl(null);
    setError(null);
    setCopied(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Stage Sync"
      subtitle={planTitle || "Share the live service plan with your team."}
      maxWidth="max-w-md"
    >
      {!result && !loading && (
        <div className="text-center">
          <p className="mb-6 text-sm text-vc-text-secondary">
            Enable Stage Sync to share a live, real-time view of the service plan
            with your worship team. The conductor controls which item is displayed,
            and participants see it update automatically on their devices.
          </p>
          <Button onClick={enableSync}>Enable Stage Sync</Button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Spinner />
          <p className="text-sm text-vc-text-secondary">Setting up Stage Sync...</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-vc-danger/20 bg-vc-danger/5 p-3 text-center text-sm text-vc-danger">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6 text-center">
          {/* QR Code */}
          {qrDataUrl && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-vc-text-muted">
                Participant QR Code
              </p>
              <img
                src={qrDataUrl}
                alt="Stage Sync QR"
                className="mx-auto rounded-lg"
                width={200}
                height={200}
              />
            </div>
          )}

          {/* Links */}
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-vc-text-muted">Conductor View</p>
              <a
                href={result.conductor_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-vc-coral hover:underline"
              >
                Open Conductor
              </a>
            </div>
            <div>
              <p className="text-xs font-medium text-vc-text-muted">Participant View</p>
              <div className="flex items-center justify-center gap-2">
                <a
                  href={result.participant_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-vc-coral hover:underline"
                >
                  Open Participant
                </a>
                <Button size="sm" variant="outline" onClick={handleCopyLink}>
                  {copied ? "Copied" : "Copy Link"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
