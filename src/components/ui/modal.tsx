"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Max width class. Defaults to "max-w-2xl". */
  maxWidth?: string;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = "max-w-2xl",
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={`relative mx-4 flex max-h-[85vh] w-full flex-col rounded-2xl border border-vc-border-light bg-white shadow-xl ${maxWidth}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-vc-border-light px-6 py-4">
          <div>
            <h2 className="font-display text-xl text-vc-indigo">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-sm text-vc-text-secondary">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 -mr-1 -mt-1 rounded-lg p-2.5 text-vc-text-muted transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M15 5L5 15M5 5l10 10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
