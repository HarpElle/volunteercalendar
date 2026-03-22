"use client";

import { useRef, useEffect, type ReactNode } from "react";

interface Tab<T extends string> {
  key: T;
  label: string;
  icon?: ReactNode;
}

interface TabBarProps<T extends string> {
  tabs: Tab<T>[];
  active: T;
  onChange: (key: T) => void;
  /** "pill" (default) for segmented pill selector, "underline" for settings/form navigation */
  variant?: "pill" | "underline";
  /** Additional class names for the container */
  className?: string;
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  variant = "pill",
  className = "",
}: TabBarProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // On mobile, scroll the active tab into view
  useEffect(() => {
    if (!scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector("[data-active=true]");
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [active]);

  if (variant === "underline") {
    return (
      <div
        ref={scrollRef}
        className={`flex gap-1 overflow-x-auto border-b border-vc-border-light scrollbar-none ${className}`}
      >
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              data-active={isActive}
              onClick={() => onChange(tab.key)}
              className={`flex min-h-[44px] shrink-0 items-center gap-2 border-b-2 px-4 pb-3 pt-3 text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "border-vc-coral text-vc-indigo"
                  : "border-transparent text-vc-text-secondary hover:border-vc-border hover:text-vc-indigo"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>
    );
  }

  // Pill variant (default)
  return (
    <div
      ref={scrollRef}
      className={`flex gap-1 overflow-x-auto rounded-xl bg-vc-bg-warm p-1 scrollbar-none ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            data-active={isActive}
            onClick={() => onChange(tab.key)}
            className={`flex min-h-[44px] flex-1 shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              isActive
                ? "bg-white text-vc-indigo shadow-sm"
                : "text-vc-text-secondary hover:text-vc-indigo"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
