"use client";

import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { updateChurchDocument } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { formatPhone } from "@/lib/utils/phone";
import type { useAuth } from "@/lib/context/auth-context";
import type { InviteQueueItem, Ministry, OrgRole } from "@/lib/types";

interface InviteQueueDrawerProps {
  open: boolean;
  onClose: () => void;
  churchId: string;
  user: ReturnType<typeof useAuth>["user"];
  items: InviteQueueItem[];
  ministries: Ministry[];
  onRefresh: () => void;
}

export function InviteQueueDrawer({
  open,
  onClose,
  churchId,
  user,
  items,
  ministries,
  onRefresh,
}: InviteQueueDrawerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [localItems, setLocalItems] = useState(items);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ sent: number; failed: number; total: number } | null>(null);

  useEffect(() => { setLocalItems(items); }, [items]);

  const pendingReview = localItems.filter((i) => i.status === "pending_review");
  const approved = localItems.filter((i) => i.status === "approved");

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === pendingReview.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingReview.map((i) => i.id)));
    }
  }

  async function bulkUpdateStatus(ids: string[], status: "approved" | "skipped") {
    for (const id of ids) {
      try {
        await updateChurchDocument(churchId, "invite_queue", id, {
          status,
          reviewed_by: user?.uid || null,
          reviewed_at: new Date().toISOString(),
        });
      } catch { /* best effort */ }
    }
    setLocalItems((prev) =>
      prev.map((i) => ids.includes(i.id) ? { ...i, status } : i),
    );
    setSelected(new Set());
  }

  function handleApproveSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    bulkUpdateStatus(ids, "approved");
  }

  function handleSkipSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    bulkUpdateStatus(ids, "skipped");
  }

  async function handleSendApproved() {
    const approvedIds = approved.map((i) => i.id);
    if (approvedIds.length === 0) return;
    setSending(true);
    setSendProgress({ sent: 0, failed: 0, total: approvedIds.length });
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/invite/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ church_id: churchId, queue_item_ids: approvedIds }),
      });
      const data = await res.json();
      setSendProgress({ sent: data.sent || 0, failed: data.failed || 0, total: approvedIds.length });
      onRefresh();
    } catch {
      setSendProgress((prev) => prev ? { ...prev, failed: prev.total } : null);
    } finally {
      setSending(false);
    }
  }

  function handleEditRole(id: string, newRole: OrgRole) {
    updateChurchDocument(churchId, "invite_queue", id, { role: newRole });
    setLocalItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, role: newRole } : i)),
    );
  }

  const subtitle = `${pendingReview.length} pending review \u00b7 ${approved.length} approved`;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Review Import Queue"
      subtitle={subtitle}
      maxWidth="max-w-2xl"
    >
      {sendProgress && !sending && (
        <div className="mb-4 rounded-lg bg-vc-sage/10 px-4 py-3">
          <p className="text-sm font-medium text-vc-sage">
            {sendProgress.sent} invite{sendProgress.sent !== 1 ? "s" : ""} sent
            {sendProgress.failed > 0 && (
              <span className="text-vc-danger"> &middot; {sendProgress.failed} failed</span>
            )}
          </p>
        </div>
      )}

      {/* Bulk actions */}
      {pendingReview.length > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={selectAll}
            className="rounded-lg border border-vc-border px-3 py-1.5 text-xs font-medium text-vc-text-secondary hover:bg-vc-bg-warm transition-colors"
          >
            {selected.size === pendingReview.length ? "Deselect All" : "Select All"}
          </button>
          {selected.size > 0 && (
            <>
              <span className="text-xs text-vc-text-muted">{selected.size} selected</span>
              <button
                onClick={handleApproveSelected}
                className="rounded-lg bg-vc-sage/15 px-3 py-1.5 text-xs font-medium text-vc-sage hover:bg-vc-sage/25 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={handleSkipSelected}
                className="rounded-lg bg-vc-bg-cream px-3 py-1.5 text-xs font-medium text-vc-text-muted hover:bg-vc-bg-warm transition-colors"
              >
                Skip
              </button>
            </>
          )}
          {approved.length > 0 && (
            <div className="ml-auto">
              <Button onClick={handleSendApproved} loading={sending}>
                Send {approved.length} Invite{approved.length !== 1 ? "s" : ""}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Only approved, no pending */}
      {pendingReview.length === 0 && approved.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-vc-text-secondary">All items reviewed. Ready to send invites.</p>
          <Button onClick={handleSendApproved} loading={sending}>
            Send {approved.length} Invite{approved.length !== 1 ? "s" : ""}
          </Button>
        </div>
      )}

      {/* Sending progress */}
      {sending && sendProgress && (
        <div className="mb-4 rounded-lg bg-vc-bg-warm px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-vc-coral/20 border-t-vc-coral" />
            <p className="text-sm font-medium text-vc-indigo">
              Sending invites... {sendProgress.sent + sendProgress.failed} of {sendProgress.total}
            </p>
          </div>
        </div>
      )}

      {/* Queue table */}
      {localItems.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-vc-border-light">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-vc-border-light bg-vc-bg-warm/50">
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Name</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Email</th>
                <th className="hidden px-3 py-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted sm:table-cell">Phone</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Source</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Role</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vc-border-light">
              {localItems.map((item) => (
                <tr key={item.id} className="hover:bg-vc-bg-warm/30 transition-colors">
                  <td className="px-3 py-2">
                    {item.status === "pending_review" && (
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded border-vc-border text-vc-coral focus:ring-vc-coral"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-vc-indigo">{item.name || "\u2014"}</td>
                  <td className="px-3 py-2 text-vc-text-secondary">{item.email || "\u2014"}</td>
                  <td className="hidden px-3 py-2 text-vc-text-secondary sm:table-cell">{formatPhone(item.phone)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-full bg-vc-bg-warm px-2 py-0.5 text-xs font-medium text-vc-text-secondary">
                      {item.source === "csv" ? "CSV" : item.source === "chms" ? (item.source_provider || "ChMS") : "Manual"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={item.role}
                      onChange={(e) => handleEditRole(item.id, e.target.value as OrgRole)}
                      disabled={item.status !== "pending_review" && item.status !== "approved"}
                      className="rounded-lg border border-vc-border bg-white px-2 py-1 text-xs text-vc-text-secondary focus:border-vc-coral focus:outline-none"
                    >
                      <option value="volunteer">Volunteer</option>
                      <option value="scheduler">Scheduler</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {item.status === "pending_review" && (
                      <span className="inline-flex items-center rounded-full bg-vc-sand/30 px-2 py-0.5 text-xs font-medium text-vc-sand">
                        Pending
                      </span>
                    )}
                    {item.status === "approved" && (
                      <span className="inline-flex items-center rounded-full bg-vc-sage/15 px-2 py-0.5 text-xs font-medium text-vc-sage">
                        Approved
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-vc-border-light bg-white p-8 text-center">
          <p className="text-vc-text-muted">Queue is empty. Import people from CSV or a ChMS to get started.</p>
        </div>
      )}
    </Drawer>
  );
}
