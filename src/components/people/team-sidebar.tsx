"use client";

import { useRef, useEffect } from "react";
import type { Ministry, Person } from "@/lib/types";

interface TeamSidebarProps {
  ministries: Ministry[];
  volunteers: Person[];
  selectedMinistryId: string | null;
  onSelectMinistry: (id: string | null) => void;
}

/**
 * Desktop: Vertical sidebar list of teams with member counts.
 * Mobile: Horizontal scrollable chip bar.
 */
export function TeamSidebar({
  ministries,
  volunteers,
  selectedMinistryId,
  onSelectMinistry,
}: TeamSidebarProps) {
  const activeVols = volunteers.filter((v) => v.status !== "archived");
  const totalCount = activeVols.length;

  const counts = new Map<string, number>();
  for (const v of activeVols) {
    for (const mid of v.ministry_ids) {
      counts.set(mid, (counts.get(mid) || 0) + 1);
    }
  }

  const items: { id: string | null; label: string; color: string; count: number }[] = [
    { id: null, label: "All", color: "", count: totalCount },
    ...ministries.map((m) => ({
      id: m.id,
      label: m.name,
      color: m.color,
      count: counts.get(m.id) || 0,
    })),
  ];

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block w-56 shrink-0">
        <nav className="sticky top-4 rounded-xl border border-vc-border-light bg-white py-2">
          <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-vc-text-muted">
            Teams
          </p>
          {items.map((item) => {
            const active = selectedMinistryId === item.id;
            return (
              <button
                key={item.id ?? "all"}
                onClick={() => onSelectMinistry(item.id)}
                className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors ${
                  active
                    ? "border-l-[3px] pl-[13px] bg-vc-bg-warm font-medium text-vc-indigo"
                    : "text-vc-text-secondary hover:bg-vc-bg-warm/50 hover:text-vc-indigo"
                }`}
                style={active && item.color ? { borderLeftColor: item.color } : active ? { borderLeftColor: "var(--vc-coral)" } : undefined}
              >
                {item.color && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                )}
                <span className="flex-1 truncate">{item.label}</span>
                <span className="text-xs text-vc-text-muted">{item.count}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Mobile chip bar */}
      <MobileChipBar
        items={items}
        selectedId={selectedMinistryId}
        onSelect={onSelectMinistry}
      />
    </>
  );
}

// --- Mobile horizontal chip bar ---

function MobileChipBar({
  items,
  selectedId,
  onSelect,
}: {
  items: { id: string | null; label: string; color: string; count: number }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedId]);

  return (
    <div className="md:hidden mb-3 -mx-1 overflow-x-auto scrollbar-none">
      <div className="flex gap-2 px-1 py-1">
        {items.map((item) => {
          const active = selectedId === item.id;
          return (
            <button
              key={item.id ?? "all"}
              ref={active ? activeRef : undefined}
              onClick={() => onSelect(item.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors min-h-[36px] ${
                active
                  ? "text-white shadow-sm"
                  : "border border-vc-border bg-white text-vc-text-secondary hover:bg-vc-bg-warm"
              }`}
              style={active ? { backgroundColor: item.color || "var(--vc-coral)" } : undefined}
            >
              {item.color && !active && (
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              )}
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
