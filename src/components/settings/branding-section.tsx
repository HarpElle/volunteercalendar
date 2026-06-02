"use client";

/**
 * Wave 11 Org Branding — Settings → Organization → Branding section.
 *
 * Lets an admin/owner upload, preview, and remove the church's logo.
 * Backed by POST/DELETE /api/admin/org/branding/logo. When the logo
 * is uploaded, downstream surfaces (wallet pass, email headers,
 * /guardian portal, kiosk welcome) substitute it for the VolunteerCal
 * mark — those surface integrations land in subsequent sub-PRs (B/C/D).
 *
 * Sub-PR A is the foundation only: this UI saves the logo and shows a
 * preview, but no other surface uses it yet. That's intentional —
 * letting Jason validate the upload round-trip + Storage rules in
 * isolation before sweeping consumers.
 */

import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";

interface BrandingSectionProps {
  churchId: string;
  currentLogoUrl: string | null;
  onChange: (newLogoUrl: string | null) => void;
}

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/svg+xml";

export function BrandingSection({
  churchId,
  currentLogoUrl,
  onChange,
}: BrandingSectionProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const upload = useCallback(
    async (file: File) => {
      if (!user) return;
      setError(null);
      setSuccess(null);

      // Client-side guardrails — server validates again
      if (file.size > MAX_BYTES) {
        setError(
          `That file is ${Math.round(file.size / 1024)}KB. Max is ${Math.round(MAX_BYTES / 1024)}KB.`,
        );
        return;
      }
      const ok =
        file.type === "image/png" ||
        file.type === "image/jpeg" ||
        file.type === "image/svg+xml";
      if (!ok) {
        setError(`Unsupported format ${file.type}. Use PNG, JPEG, or SVG.`);
        return;
      }

      setUploading(true);
      try {
        const token = await user.getIdToken();
        const form = new FormData();
        form.set("church_id", churchId);
        form.set("file", file);
        const res = await fetch("/api/admin/org/branding/logo", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? "Upload failed");
        }
        const data = (await res.json()) as { logo_url: string };
        onChange(data.logo_url);
        flashSuccess("Logo updated");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [user, churchId, onChange],
  );

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void upload(f);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void upload(f);
  };

  const handleRemove = useCallback(async () => {
    if (!user) return;
    if (
      !window.confirm(
        "Remove the church logo? Parent-facing surfaces will revert to the VolunteerCal mark.",
      )
    ) {
      return;
    }
    setRemoving(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/org/branding/logo?church_id=${encodeURIComponent(churchId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Remove failed");
      }
      onChange(null);
      flashSuccess("Logo removed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setRemoving(false);
    }
  }, [user, churchId, onChange]);

  return (
    <section className="rounded-2xl border border-vc-border-light bg-white p-6">
      <header className="mb-4">
        <h2 className="font-display text-2xl text-vc-indigo">Branding</h2>
        <p className="mt-2 text-sm text-vc-text-secondary">
          Upload your church or organization&rsquo;s logo. It&rsquo;ll appear
          on parent-facing surfaces — the Apple Wallet family pass, parent
          self-service portal, kiosk welcome screen, and email headers —
          where today only the VolunteerCal mark shows. Admins and staff
          inside the platform always see the VolunteerCal brand.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-[160px_1fr]">
        {/* Preview */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-32 w-32 items-center justify-center rounded-2xl border border-vc-border-light bg-vc-bg-warm">
            {currentLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentLogoUrl}
                alt="Current church logo"
                className="max-h-28 max-w-28 object-contain"
              />
            ) : (
              <span className="text-xs text-vc-text-muted text-center px-2">
                No logo
              </span>
            )}
          </div>
          <p className="text-xs text-vc-text-muted text-center">
            Preview
          </p>
        </div>

        {/* Drop zone + actions */}
        <div className="flex flex-col gap-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver
                ? "border-vc-coral bg-vc-coral/5"
                : "border-vc-border-light bg-vc-bg-warm"
            }`}
          >
            <p className="text-sm font-medium text-vc-indigo">
              Drop an image here, or
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-vc-coral text-white text-sm font-medium min-h-[44px] disabled:opacity-60"
            >
              {uploading ? "Uploading…" : "Choose file"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={handleFileInputChange}
            />
            <p className="mt-3 text-xs text-vc-text-muted">
              PNG, JPEG, or SVG. Up to 2MB. At least 256×256 pixels.
              Square logos look best on the wallet pass; landscape works
              fine on emails.
            </p>
          </div>

          {currentLogoUrl && !uploading && (
            <Button
              variant="ghost"
              onClick={handleRemove}
              loading={removing}
              className="self-start text-vc-text-secondary"
            >
              Remove logo
            </Button>
          )}

          {error && (
            <p
              role="alert"
              className="text-sm text-vc-coral bg-vc-coral/5 border border-vc-coral/20 rounded-lg p-2"
            >
              {error}
            </p>
          )}
          {success && (
            <p
              role="status"
              className="text-sm text-vc-sage bg-vc-sage/5 border border-vc-sage/20 rounded-lg p-2"
            >
              {success}
            </p>
          )}

          <p className="text-xs text-vc-text-muted">
            Sub-PR A foundation: this UI saves the logo, but the parent-
            facing surfaces (wallet pass, emails, /guardian, kiosk) still
            show the VolunteerCal mark until Sub-PRs B-D ship. Your
            uploaded logo will start appearing on those surfaces as each
            sub-PR lands.
          </p>
        </div>
      </div>
    </section>
  );
}
