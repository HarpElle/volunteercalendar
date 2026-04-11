"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizePhone, formatPhone } from "@/lib/utils/phone";
import { updateChurchDocument, removeChurchDocument } from "@/lib/firebase/firestore";
import type { Volunteer, Ministry } from "@/lib/types";

interface VolunteerEditModalProps {
  open: boolean;
  onClose: () => void;
  volunteer: Volunteer;
  churchId: string;
  ministries: Ministry[];
  availableRoles: { role_id: string; title: string; ministry_id: string }[];
  getMinistryName: (id: string) => string;
  getMinistryColor: (id: string) => string;
  onUpdated: (v: Volunteer) => void;
  onDelete: () => void;
}

export function VolunteerEditModal({
  open,
  onClose,
  volunteer,
  churchId,
  ministries,
  availableRoles,
  getMinistryName,
  getMinistryColor,
  onUpdated,
  onDelete,
}: VolunteerEditModalProps) {
  const [name, setName] = useState(volunteer.name);
  const [email, setEmail] = useState(volunteer.email);
  const [phone, setPhone] = useState(volunteer.phone || "");
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>(volunteer.ministry_ids);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(volunteer.role_ids);
  const [bgCheckStatus, setBgCheckStatus] = useState<string>(volunteer.background_check?.status || "not_required");
  const [bgCheckExpiry, setBgCheckExpiry] = useState(volunteer.background_check?.expires_at || "");
  const [allowMultiRole, setAllowMultiRole] = useState(volunteer.role_constraints?.allow_multi_role || false);
  const [conditionalRoles, setConditionalRoles] = useState<Array<{ role_id: string; requires_any: string[] }>>(
    volunteer.role_constraints?.conditional_roles || [],
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset form state when modal opens or volunteer changes
  useEffect(() => {
    if (open) {
      setName(volunteer.name);
      setEmail(volunteer.email);
      setPhone(volunteer.phone || "");
      setSelectedMinistries(volunteer.ministry_ids);
      setSelectedRoles(volunteer.role_ids);
      setBgCheckStatus(volunteer.background_check?.status || "not_required");
      setBgCheckExpiry(volunteer.background_check?.expires_at || "");
      setAllowMultiRole(volunteer.role_constraints?.allow_multi_role || false);
      setConditionalRoles(volunteer.role_constraints?.conditional_roles || []);
      setSaving(false);
      setDeleting(false);
    }
  }, [open, volunteer]);

  function toggleMinistry(id: string) {
    setSelectedMinistries((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  function toggleRole(id: string) {
    setSelectedRoles((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const background_check = bgCheckStatus === "not_required" ? undefined : {
        status: bgCheckStatus as "cleared" | "pending" | "expired" | "not_required",
        expires_at: bgCheckExpiry || null,
        provider: volunteer.background_check?.provider || null,
        checked_at: bgCheckStatus === "cleared" && volunteer.background_check?.status !== "cleared"
          ? new Date().toISOString()
          : volunteer.background_check?.checked_at || null,
      };
      const roleConstraints = (allowMultiRole || conditionalRoles.length > 0)
        ? {
            allow_multi_role: allowMultiRole,
            conditional_roles: conditionalRoles,
          }
        : undefined;
      const updateData = {
        name,
        email,
        phone: phone ? normalizePhone(phone) : null,
        ministry_ids: selectedMinistries,
        role_ids: selectedRoles,
        background_check: background_check || undefined,
        role_constraints: roleConstraints,
      };
      await updateChurchDocument(churchId, "people", volunteer.id, updateData);
      onUpdated({ ...volunteer, ...updateData });
      onClose();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Volunteer" subtitle={volunteer.name}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => { if (phone) setPhone(formatPhone(phone)); }} />
        </div>
        {ministries.length > 0 && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-vc-text">
              {getMinistryName("__label__") === "__label__" ? "Teams" : "Ministries"}
            </label>
            <div className="flex flex-wrap gap-2">
              {ministries.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMinistry(m.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                    selectedMinistries.includes(m.id)
                      ? "border-transparent text-white"
                      : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                  }`}
                  style={
                    selectedMinistries.includes(m.id)
                      ? { backgroundColor: m.color }
                      : undefined
                  }
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: selectedMinistries.includes(m.id) ? "white" : m.color }}
                  />
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Roles (filtered to selected ministries) */}
        {(() => {
          const relevantRoles = availableRoles.filter(
            (r) => selectedMinistries.includes(r.ministry_id),
          );
          if (relevantRoles.length === 0) return null;
          return (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-vc-text">
                Qualified Roles
              </label>
              <p className="mb-2 text-xs text-vc-text-muted">
                Leave all unchecked to allow any role. Check specific roles to restrict scheduling.
              </p>
              <div className="flex flex-wrap gap-2">
                {relevantRoles.map((r) => (
                  <button
                    key={r.role_id}
                    type="button"
                    onClick={() => toggleRole(r.role_id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                      selectedRoles.includes(r.role_id)
                        ? "border-vc-coral bg-vc-coral/10 text-vc-coral"
                        : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                    }`}
                  >
                    {selectedRoles.includes(r.role_id) && (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                    {r.title}
                    <span className="text-[10px] text-vc-text-muted">
                      ({getMinistryName(r.ministry_id)})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}
        {/* Background Check */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-vc-text">Background Check</label>
            <select
              className="w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none"
              value={bgCheckStatus}
              onChange={(e) => setBgCheckStatus(e.target.value)}
            >
              <option value="not_required">Not Required</option>
              <option value="pending">Pending</option>
              <option value="cleared">Cleared</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          {(bgCheckStatus === "cleared" || bgCheckStatus === "expired") && (
            <Input
              label="Expiry Date"
              type="date"
              value={bgCheckExpiry}
              onChange={(e) => setBgCheckExpiry(e.target.value)}
            />
          )}
        </div>
        {/* Advanced Role Constraints (worship/music teams) */}
        {selectedRoles.length >= 2 && (
          <div className="rounded-lg border border-vc-border-light bg-vc-bg-warm/30 p-3 space-y-3">
            <label className="block text-sm font-medium text-vc-text">
              Advanced Role Settings
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={allowMultiRole}
                onChange={(e) => setAllowMultiRole(e.target.checked)}
                className="h-4 w-4 rounded border-vc-border text-vc-coral focus:ring-vc-coral"
              />
              <span className="text-sm text-vc-text-secondary">
                Allow multiple roles in the same service <span className="text-xs text-vc-text-muted">(e.g., Guitar + Vocals)</span>
              </span>
            </label>
            <div>
              <p className="mb-2 text-xs text-vc-text-muted">
                Conditional roles — e.g., &quot;Vocals&quot; only when also assigned &quot;Guitar&quot; or &quot;Keys&quot;
              </p>
              {selectedRoles.map((roleId) => {
                const roleInfo = availableRoles.find((r) => r.role_id === roleId);
                if (!roleInfo) return null;
                const existing = conditionalRoles.find((c) => c.role_id === roleId);
                const otherRoles = selectedRoles.filter((r) => r !== roleId);
                if (otherRoles.length === 0) return null;
                return (
                  <div key={roleId} className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-sm text-vc-text font-medium w-24 shrink-0">{roleInfo.title}</span>
                    <span className="text-xs text-vc-text-muted">requires:</span>
                    {otherRoles.map((otherId) => {
                      const otherInfo = availableRoles.find((r) => r.role_id === otherId);
                      const isRequired = existing?.requires_any.includes(otherId) || false;
                      return (
                        <button
                          key={otherId}
                          type="button"
                          onClick={() => {
                            setConditionalRoles((prev) => {
                              const clone = prev.map((c) => ({ ...c, requires_any: [...c.requires_any] }));
                              const idx = clone.findIndex((c) => c.role_id === roleId);
                              if (isRequired) {
                                if (idx >= 0) {
                                  clone[idx].requires_any = clone[idx].requires_any.filter((r) => r !== otherId);
                                  if (clone[idx].requires_any.length === 0) clone.splice(idx, 1);
                                }
                              } else {
                                if (idx >= 0) {
                                  clone[idx].requires_any.push(otherId);
                                } else {
                                  clone.push({ role_id: roleId, requires_any: [otherId] });
                                }
                              }
                              return clone;
                            });
                          }}
                          className={`rounded px-2 py-1 text-xs font-medium border transition-all ${
                            isRequired
                              ? "border-vc-sage bg-vc-sage/10 text-vc-sage"
                              : "border-vc-border text-vc-text-muted hover:border-vc-sage/30"
                          }`}
                        >
                          {otherInfo?.title || otherId}
                        </button>
                      );
                    })}
                    {!existing && <span className="text-xs text-vc-text-muted italic">no dependency</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" loading={saving} onClick={handleSave}>Save</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            loading={deleting}
            onClick={handleDelete}
            className="text-vc-text-muted hover:text-vc-danger"
          >
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
