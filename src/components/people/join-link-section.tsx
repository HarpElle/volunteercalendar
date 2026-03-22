"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { ShortLinkCreator } from "@/components/ui/short-link-creator";

export function JoinLinkSection({ churchId, churchName, churchTier }: { churchId: string; churchName: string; churchTier: string }) {
  const { user } = useAuth();
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const joinLink = `${baseUrl}/join/${churchId}`;
  const [copied, setCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showShortLinkCreator, setShowShortLinkCreator] = useState(false);
  const [joinShortLinkUrl, setJoinShortLinkUrl] = useState<string | null>(null);
  const shareRef = useRef<HTMLDivElement>(null);

  // Fetch short link for join URL
  useEffect(() => {
    if (!churchId || !user) return;
    async function fetchShortLink() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch(`/api/short-links?church_id=${churchId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const joinPath = `/join/${churchId}`;
          const match = (data.links || []).find((l: { target_url: string }) => l.target_url === joinPath);
          if (match) {
            setJoinShortLinkUrl(`${window.location.origin}/s/${match.slug}`);
          }
        }
      } catch {
        // silent
      }
    }
    fetchShortLink();
  }, [churchId, user]);

  // Close share menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    }
    if (showShareMenu) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showShareMenu]);

  const hasShortLink = !!joinShortLinkUrl;

  function handleCopy() {
    const urlToCopy = hasShortLink ? joinShortLinkUrl! : joinLink;
    navigator.clipboard.writeText(urlToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handlePrintFlyer() {
    setShowShareMenu(false);
    const { printFlyer } = await import("@/lib/utils/print-flyer");
    printFlyer({
      title: "Volunteer With Us!",
      subtitle: "Scan the QR code to sign up as a volunteer.",
      orgName: churchName,
      url: joinLink,
      shortUrl: joinShortLinkUrl || undefined,
      instructions: [
        "Scan the QR code with your phone camera",
        "Create a free account (or sign in)",
        "Request to join — we'll approve you shortly!",
      ],
    });
  }

  async function handleDownloadSlide() {
    setShowShareMenu(false);
    const { downloadSlide } = await import("@/lib/utils/download-slide");
    downloadSlide({
      title: "Volunteer With Us!",
      subtitle: "Scan the QR code to sign up as a volunteer.",
      orgName: churchName,
      url: joinLink,
      shortUrl: joinShortLinkUrl || undefined,
    });
  }

  const menuBtnClass = "w-full px-3 py-2.5 text-left text-sm text-vc-text-secondary hover:bg-vc-bg-warm transition-colors flex items-center gap-2";

  return (
    <div className="mt-6 rounded-xl border border-dashed border-vc-border bg-vc-bg-warm p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-vc-indigo">Share join link</p>
        <div className="relative" ref={shareRef}>
          <button
            onClick={() => setShowShareMenu(!showShareMenu)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-vc-text-secondary hover:bg-white hover:text-vc-indigo transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
            </svg>
            Share options
          </button>
          {showShareMenu && (
            <div className="absolute right-0 top-full mt-1 z-10 w-52 rounded-xl border border-vc-border-light bg-white py-1 shadow-lg">
              {/* 1. Short link (create or edit) — first with premium badge */}
              <button
                onClick={() => { setShowShareMenu(false); setShowShortLinkCreator(true); }}
                className={menuBtnClass}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
                <span className="flex items-center gap-1.5">
                  {hasShortLink ? "Edit short link" : "Create short link"}
                  {!hasShortLink && (
                    <span className="rounded bg-vc-coral/10 px-1 py-0.5 text-[10px] font-semibold uppercase leading-none text-vc-coral">
                      Pro
                    </span>
                  )}
                </span>
              </button>

              {/* 2. Copy link / Copy short link */}
              <button
                onClick={() => { handleCopy(); setShowShareMenu(false); }}
                className={menuBtnClass}
              >
                {copied ? (
                  <svg className="h-4 w-4 shrink-0 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                  </svg>
                )}
                {copied ? "Copied!" : hasShortLink ? "Copy short link" : "Copy link"}
              </button>

              {/* 3. Print QR flyer */}
              <button
                onClick={handlePrintFlyer}
                className={menuBtnClass}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
                </svg>
                Print QR flyer
              </button>

              {/* 4. Download slide */}
              <button
                onClick={handleDownloadSlide}
                className={menuBtnClass}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download slide (16:9)
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={hasShortLink ? joinShortLinkUrl! : joinLink}
          className="flex-1 rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text-secondary"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button
          onClick={handleCopy}
          className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            copied
              ? "border-vc-sage/30 bg-vc-sage/10 text-vc-sage"
              : "border-vc-border text-vc-text-secondary hover:bg-white"
          }`}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="mt-1 text-xs text-vc-text-muted">
        Anyone with this link can request to join. You'll need to approve them.
      </p>

      {showShortLinkCreator && (
        <div className="mt-3">
          <ShortLinkCreator
            churchId={churchId}
            targetUrl={`/join/${churchId}`}
            label={`Volunteer signup — ${churchName}`}
            tier={churchTier}
            onClose={() => setShowShortLinkCreator(false)}
          />
        </div>
      )}
    </div>
  );
}
