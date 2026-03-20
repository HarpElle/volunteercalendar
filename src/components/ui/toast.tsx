"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastVariant = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  /** Optional action button (e.g., "Undo") */
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toast: (
    message: string,
    variant?: ToastVariant,
    action?: Toast["action"],
  ) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Variant styles
// ---------------------------------------------------------------------------

const variantStyles: Record<ToastVariant, string> = {
  success:
    "border-vc-sage/30 bg-vc-sage/10 text-vc-sage-dark",
  error:
    "border-vc-danger/30 bg-vc-danger/10 text-vc-danger",
  info:
    "border-vc-indigo/20 bg-vc-indigo/5 text-vc-indigo",
  warning:
    "border-vc-sand/40 bg-vc-sand/15 text-vc-warning",
};

const variantIcons: Record<ToastVariant, ReactNode> = {
  success: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  ),
  error: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
    </svg>
  ),
  info: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
    </svg>
  ),
  warning: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Single toast item
// ---------------------------------------------------------------------------

const DURATION = 4000;

function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [progress, setProgress] = useState(100);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const start = Date.now();
    const frame = () => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / DURATION) * 100);
      setProgress(pct);
      if (pct > 0) requestAnimationFrame(frame);
      else {
        setExiting(true);
        setTimeout(() => onDismiss(t.id), 200);
      }
    };
    const raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [t.id, onDismiss]);

  return (
    <div
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm transition-all duration-200 ${variantStyles[t.variant]} ${exiting ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"}`}
      role="alert"
    >
      <span className="mt-0.5">{variantIcons[t.variant]}</span>
      <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
      {t.action && (
        <button
          onClick={() => {
            t.action!.onClick();
            setExiting(true);
            setTimeout(() => onDismiss(t.id), 200);
          }}
          className="shrink-0 text-sm font-semibold underline underline-offset-2 hover:opacity-80"
        >
          {t.action.label}
        </button>
      )}
      <button
        onClick={() => {
          setExiting(true);
          setTimeout(() => onDismiss(t.id), 200);
        }}
        className="ml-1 shrink-0 rounded p-1 opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
      {/* Progress bar */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b-xl">
        <div
          className="h-full bg-current opacity-30 transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = "info", action?: Toast["action"]) => {
      const id = crypto.randomUUID();
      setToasts((prev) => {
        const next = [...prev, { id, message, variant, action }];
        // Keep max 3 visible
        return next.length > 3 ? next.slice(-3) : next;
      });
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      {/* Toast container */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
