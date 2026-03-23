"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

interface PdfChartViewerProps {
  songId: string;
  churchId: string;
  selectedKey?: string | null;
}

export function PdfChartViewer({ songId, churchId, selectedKey }: PdfChartViewerProps) {
  const { user } = useAuth();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPdfUrl = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ church_id: churchId });
      if (selectedKey) params.set("key", selectedKey);

      const res = await fetch(`/api/songs/${songId}/pdf-url?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load PDF");
      }

      const { url } = await res.json();
      setPdfUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PDF");
    } finally {
      setLoading(false);
    }
  }, [user, songId, churchId, selectedKey]);

  useEffect(() => {
    loadPdfUrl();
  }, [loadPdfUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !pdfUrl) {
    return (
      <div className="rounded-xl border border-vc-danger/20 bg-vc-danger/5 p-8 text-center">
        <p className="text-sm text-vc-danger">{error || "PDF not available"}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={loadPdfUrl}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-vc-border-light px-3 py-1.5 text-sm text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-indigo transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Download PDF
        </a>
      </div>
      <iframe
        src={pdfUrl}
        className="w-full rounded-lg border border-vc-border-light"
        style={{ height: "800px" }}
        title="Song chord chart PDF"
      />
    </div>
  );
}
