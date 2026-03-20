"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" shows a red confirm button. Default is "default". */
  variant?: "default" | "danger";
}

interface ConfirmContextValue {
  /** Show a branded confirm dialog. Resolves `true` if confirmed, `false` if cancelled. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx)
    throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ options, resolve });
    });
  }, []);

  function handleResponse(value: boolean) {
    state?.resolve(value);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {state && (
        <Modal
          open
          onClose={() => handleResponse(false)}
          title={state.options.title}
          maxWidth="max-w-md"
        >
          <p className="mb-6 text-sm leading-relaxed text-vc-text-secondary">
            {state.options.message}
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleResponse(false)}
            >
              {state.options.cancelLabel || "Cancel"}
            </Button>
            <Button
              variant={state.options.variant === "danger" ? "danger" : "primary"}
              size="sm"
              onClick={() => handleResponse(true)}
            >
              {state.options.confirmLabel || "Confirm"}
            </Button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
