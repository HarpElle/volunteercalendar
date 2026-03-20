"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

interface InfoTooltipProps {
  text: string;
  position?: "top" | "bottom";
}

export function InfoTooltip({ text, position = "bottom" }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative inline-flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-vc-text-muted transition-colors hover:text-vc-indigo"
        aria-label="More information"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: position === "top" ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: position === "top" ? 4 : -4 }}
            transition={{ duration: 0.15 }}
            className={`absolute left-1/2 z-50 w-[280px] -translate-x-1/2 rounded-lg bg-vc-indigo px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-lg ${
              position === "top" ? "bottom-full mb-2" : "top-full mt-2"
            }`}
          >
            {text}
            <div
              className={`absolute left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 bg-vc-indigo ${
                position === "top" ? "top-full -mt-1" : "bottom-full -mb-1"
              }`}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
