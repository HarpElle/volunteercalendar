"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Modal } from "@/components/ui/modal";
import { getAuth } from "firebase/auth";

interface CheckInQRProps {
  churchId: string;
  serviceId: string;
  serviceDate: string;
  scheduleId?: string;
  serviceName?: string;
}

/**
 * Button + modal that generates a QR code for volunteer self-check-in.
 * The QR code links to /check-in/{code}.
 */
export function CheckInQR({
  churchId,
  serviceId,
  serviceDate,
  scheduleId,
  serviceName,
}: CheckInQRProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateQR() {
    setOpen(true);
    setLoading(true);
    setError(null);

    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const params = new URLSearchParams({
        church_id: churchId,
        service_id: serviceId,
        service_date: serviceDate,
        ...(scheduleId ? { schedule_id: scheduleId } : {}),
      });

      const res = await fetch(`/api/check-in?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setError("Failed to generate check-in code");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setCode(data.code);

      // Generate QR code as data URL
      const url = `${window.location.origin}/check-in/${data.code}`;
      const dataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: { dark: "#2D3047", light: "#FEFCF9" },
      });
      setQrDataUrl(dataUrl);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    if (!qrDataUrl || !code) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const dateLabel = new Date(serviceDate + "T12:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    printWindow.document.write(`
      <html>
        <head><title>Check-In QR — ${serviceName || "Service"}</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 40px;">
          <h1 style="color: #2D3047; font-size: 28px; margin-bottom: 4px;">${serviceName || "Service"}</h1>
          <p style="color: #666; font-size: 16px; margin-bottom: 24px;">${dateLabel}</p>
          <img src="${qrDataUrl}" alt="QR Code" style="width: 300px; height: 300px;" />
          <p style="color: #2D3047; font-size: 24px; font-weight: bold; letter-spacing: 4px; margin-top: 16px;">${code}</p>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">Scan to check in with VolunteerCal</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  return (
    <>
      <button
        onClick={generateQR}
        className="inline-flex items-center gap-1.5 rounded-lg border border-vc-border px-3 py-1.5 text-xs font-medium text-vc-text-secondary hover:border-vc-coral hover:text-vc-coral transition-colors"
        title="Generate QR code for volunteer check-in"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
        </svg>
        QR Check-In
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Check-In QR Code"
        maxWidth="max-w-sm"
      >
        {loading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Spinner />
            <p className="text-sm text-vc-text-secondary">Generating code...</p>
          </div>
        )}

        {error && (
          <div className="py-8 text-center">
            <p className="text-sm text-vc-text-secondary">{error}</p>
          </div>
        )}

        {qrDataUrl && code && !loading && (
          <div className="text-center">
            {serviceName && (
              <p className="mb-1 text-sm font-medium text-vc-indigo">{serviceName}</p>
            )}
            <p className="mb-4 text-xs text-vc-text-muted">
              {new Date(serviceDate + "T12:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <img
              src={qrDataUrl}
              alt="Check-in QR Code"
              className="mx-auto rounded-lg"
              width={250}
              height={250}
            />
            <p className="mt-3 font-mono text-2xl font-bold tracking-[0.2em] text-vc-indigo">
              {code}
            </p>
            <p className="mt-1 text-xs text-vc-text-muted">
              Volunteers scan this code to check in
            </p>
            <div className="mt-4 flex gap-2 justify-center">
              <Button size="sm" onClick={handlePrint}>
                Print
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/check-in/${code}`);
                }}
              >
                Copy Link
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
