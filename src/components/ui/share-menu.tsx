"use client";

import { useState, useRef, useEffect } from "react";

interface ShareMenuProps {
  onCopyLink: () => void;
  onPrintInvite: () => void;
  onDownloadSlide: () => void;
  onCreateShortLink?: () => void;
  onEmailInvite?: () => void;
  copied?: boolean;
}

export function ShareMenu({
  onCopyLink,
  onPrintInvite,
  onDownloadSlide,
  onCreateShortLink,
  onEmailInvite,
  copied,
}: ShareMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
          open
            ? "bg-vc-bg-warm text-vc-indigo"
            : "text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-indigo"
        }`}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
        </svg>
        Share
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-xl border border-vc-border-light bg-white py-1 shadow-lg">
          <button
            onClick={() => { onCopyLink(); setOpen(false); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-vc-text hover:bg-vc-bg-warm transition-colors"
          >
            {copied ? (
              <svg className="h-4 w-4 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="h-4 w-4 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
            )}
            {copied ? "Copied!" : "Copy link"}
          </button>

          <button
            onClick={() => { onPrintInvite(); setOpen(false); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-vc-text hover:bg-vc-bg-warm transition-colors"
          >
            <svg className="h-4 w-4 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
            </svg>
            Print invite
          </button>

          <button
            onClick={() => { onDownloadSlide(); setOpen(false); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-vc-text hover:bg-vc-bg-warm transition-colors"
          >
            <svg className="h-4 w-4 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download slide
          </button>

          {onCreateShortLink && (
            <button
              onClick={() => { onCreateShortLink(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-vc-text hover:bg-vc-bg-warm transition-colors"
            >
              <svg className="h-4 w-4 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
              Short link
            </button>
          )}

          {onEmailInvite && (
            <button
              onClick={() => { onEmailInvite(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-vc-text hover:bg-vc-bg-warm transition-colors"
            >
              <svg className="h-4 w-4 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
              Email invite
            </button>
          )}
        </div>
      )}
    </div>
  );
}
