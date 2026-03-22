"use client";

import { useState } from "react";
import { ChildCard } from "./child-card";

interface ChildData {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name?: string;
  grade?: string;
  has_alerts: boolean;
  photo_url?: string;
  room_name: string;
  pre_checked_in: boolean;
}

interface ChildSelectionProps {
  guardianName: string;
  children: ChildData[];
  onConfirm: (selectedIds: string[]) => void;
  onBack: () => void;
  onActivity: () => void;
}

/**
 * Screen 2: Select which children to check in.
 * Multi-select child cards with room display.
 */
export function ChildSelection({
  guardianName,
  children,
  onConfirm,
  onBack,
  onActivity,
}: ChildSelectionProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(children.map((c) => c.id)),
  );

  const handleToggle = (id: string) => {
    onActivity();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    onActivity();
    if (selectedIds.size === children.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(children.map((c) => c.id)));
    }
  };

  return (
    <div className="flex flex-col h-full p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-vc-indigo font-display mb-1">
          Welcome, {guardianName}!
        </h2>
        <p className="text-gray-500">Select the children to check in today</p>
      </div>

      {/* Select all toggle */}
      {children.length > 1 && (
        <button
          type="button"
          onClick={handleSelectAll}
          className="self-center text-sm text-vc-coral font-medium mb-4 underline"
        >
          {selectedIds.size === children.length ? "Deselect All" : "Select All"}
        </button>
      )}

      {/* Child cards */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-wrap gap-4 justify-center">
          {children.map((child) => (
            <ChildCard
              key={child.id}
              id={child.id}
              name={child.preferred_name || child.first_name}
              grade={child.grade}
              roomName={child.room_name}
              hasAlerts={child.has_alerts}
              photoUrl={child.photo_url}
              preCheckedIn={child.pre_checked_in}
              selected={selectedIds.has(child.id)}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4 mt-8 max-w-lg mx-auto w-full">
        <button
          type="button"
          onClick={() => {
            onBack();
            onActivity();
          }}
          className="flex-1 h-14 rounded-full border-2 border-gray-200 text-gray-600
            font-semibold text-lg active:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm(Array.from(selectedIds));
            onActivity();
          }}
          disabled={selectedIds.size === 0}
          className="flex-1 h-14 rounded-full bg-vc-coral text-white
            font-semibold text-lg active:bg-vc-coral/90 transition-all
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next ({selectedIds.size})
        </button>
      </div>
    </div>
  );
}
