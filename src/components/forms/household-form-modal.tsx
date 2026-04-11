"use client";

import { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Person, Household } from "@/lib/types";

interface HouseholdFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    volunteer_ids: string[];
    constraints: {
      never_same_service: boolean;
      prefer_same_service: boolean;
      never_same_time: boolean;
    };
    notes: string | null;
  }) => void;
  volunteers: Person[];
  existingHousehold?: Household;
}

export function HouseholdFormModal({
  open,
  onClose,
  onSave,
  volunteers,
  existingHousehold,
}: HouseholdFormModalProps) {
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [neverSameService, setNeverSameService] = useState(false);
  const [preferSameService, setPreferSameService] = useState(false);
  const [neverSameTime, setNeverSameTime] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Member search
  const [memberSearch, setMemberSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset form when modal opens or household changes
  useEffect(() => {
    if (open) {
      setName(existingHousehold?.name || "");
      setSelectedIds(existingHousehold?.volunteer_ids || []);
      setNeverSameService(existingHousehold?.constraints.never_same_service || false);
      setPreferSameService(existingHousehold?.constraints.prefer_same_service || false);
      setNeverSameTime(existingHousehold?.constraints.never_same_time || false);
      setNotes(existingHousehold?.notes || "");
      setMemberSearch("");
      setSaving(false);
    }
  }, [open, existingHousehold]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  const filteredVolunteers = volunteers.filter((v) => {
    if (selectedIds.includes(v.id)) return false;
    if (!memberSearch) return true;
    const q = memberSearch.toLowerCase();
    return v.name.toLowerCase().includes(q) || v.email?.toLowerCase().includes(q);
  });

  function addMember(id: string) {
    setSelectedIds((prev) => [...prev, id]);
    setMemberSearch("");
    setShowDropdown(false);
  }

  function removeMember(id: string) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  function getVolunteerName(id: string) {
    return volunteers.find((v) => v.id === id)?.name || "Unknown";
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        volunteer_ids: selectedIds,
        constraints: {
          never_same_service: neverSameService,
          prefer_same_service: preferSameService,
          never_same_time: neverSameTime,
        },
        notes: notes.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  const isEditing = !!existingHousehold;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit Family" : "Add Family"}
      subtitle={isEditing ? existingHousehold.name : undefined}
    >
      <div className="space-y-4">
        {/* Family name */}
        <Input
          label="Family name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., The Johnsons"
        />

        {/* Members multi-select */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-vc-text">
            Members
          </label>

          {/* Selected member chips */}
          {selectedIds.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {selectedIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-vc-indigo/10 px-2.5 py-1 text-xs font-medium text-vc-indigo"
                >
                  {getVolunteerName(id)}
                  <button
                    type="button"
                    onClick={() => removeMember(id)}
                    className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-vc-indigo/20"
                    aria-label={`Remove ${getVolunteerName(id)}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M9 3L3 9M3 3l6 6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search input + dropdown */}
          <div className="relative" ref={dropdownRef}>
            <input
              type="text"
              placeholder="Search volunteers to add..."
              value={memberSearch}
              onChange={(e) => {
                setMemberSearch(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
            />
            {showDropdown && filteredVolunteers.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-vc-border-light bg-white shadow-lg">
                {filteredVolunteers.slice(0, 20).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => addMember(v.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-vc-bg-warm"
                  >
                    <span className="font-medium text-vc-text">{v.name}</span>
                    {v.email && (
                      <span className="text-xs text-vc-text-muted">{v.email}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {showDropdown && memberSearch && filteredVolunteers.length === 0 && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-vc-border-light bg-white p-3 text-center text-sm text-vc-text-muted shadow-lg">
                No matching volunteers found
              </div>
            )}
          </div>
        </div>

        {/* Constraint checkboxes */}
        <div>
          <label className="mb-2 block text-sm font-medium text-vc-text">
            Scheduling constraints
          </label>
          <div className="space-y-2.5 rounded-lg border border-vc-border-light bg-vc-bg-warm/30 p-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={neverSameService}
                onChange={(e) => setNeverSameService(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-vc-border text-vc-coral focus:ring-vc-coral"
              />
              <div>
                <span className="text-sm text-vc-text">Never serve in the same service</span>
                <p className="text-xs text-vc-text-muted">
                  Prevents scheduling family members together in one service
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={preferSameService}
                onChange={(e) => setPreferSameService(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-vc-border text-vc-coral focus:ring-vc-coral"
              />
              <div>
                <span className="text-sm text-vc-text">Prefer to serve together</span>
                <p className="text-xs text-vc-text-muted">
                  Schedule family members in the same service when possible
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={neverSameTime}
                onChange={(e) => setNeverSameTime(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-vc-border text-vc-coral focus:ring-vc-coral"
              />
              <div>
                <span className="text-sm text-vc-text">Never serve at the same time</span>
                <p className="text-xs text-vc-text-muted">
                  Prevents scheduling on any service the same day
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-vc-text" htmlFor="household-notes">
            Notes
          </label>
          <textarea
            id="household-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about this family..."
            rows={3}
            className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" loading={saving} onClick={handleSave} disabled={!name.trim()}>
            {isEditing ? "Save" : "Add Family"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
