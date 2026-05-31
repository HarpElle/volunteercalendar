"use client";

/**
 * Safety panel — Wave 9 P0-3 sub-PR C.
 *
 * Renders inside `PersonDetailDrawer` directly below the Background
 * Check card. Shows:
 *
 *   - Active restrictions (with reason badge + lift affordance for owners)
 *   - Lifted (historical) restrictions, collapsed
 *   - SOR check state (last check date + match outcome)
 *
 * Owner-only edit affordances:
 *   - "Add restriction" form (reason dropdown + optional notes)
 *   - "Lift" button on each active restriction
 *   - "Log SOR check" form (match toggle + optional provider)
 *
 * Non-owners get a read-only view. The data itself is volunteer-readable
 * via the existing Person doc rules; the privacy boundary is enforced
 * upstream by hiding the panel from the drawer when the viewer isn't
 * an admin (`canManage === false`). Owners get the full management UI.
 *
 * Network calls hit the routes shipped in sub-PR B:
 *   POST   /api/people/restrictions
 *   PATCH  /api/people/restrictions/[id]
 *   POST   /api/people/sor-check
 *
 * The panel optimistically refreshes its local view via the parent's
 * onVolunteerUpdated callback, mirroring the bg-check section's flow.
 */

import { useState } from "react";
import type { Person, PersonRestriction } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface SafetyPanelProps {
  volunteer: Person;
  churchId: string;
  isOwner: boolean;
  onVolunteerUpdated: (v: Person) => void;
}

const REASON_LABELS: Record<PersonRestriction["reason"], string> = {
  sor_match: "Sex Offender Registry match",
  policy: "Org policy decision",
  other: "Other",
};

async function bearerToken(): Promise<string | null> {
  const { getAuth } = await import("firebase/auth");
  return (await getAuth().currentUser?.getIdToken()) ?? null;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "—";
  }
}

export function SafetyPanel({
  volunteer,
  churchId,
  isOwner,
  onVolunteerUpdated,
}: SafetyPanelProps) {
  const restrictions: PersonRestriction[] = volunteer.restrictions ?? [];
  const active = restrictions.filter((r) => !r.lifted_at);
  const lifted = restrictions.filter((r) => !!r.lifted_at);

  const bg = volunteer.background_check;
  const sorChecked = !!bg?.last_sor_check_at;
  const sorMatch = bg?.sor_match;

  // ---- Add-restriction form ----
  const [adding, setAdding] = useState(false);
  const [addReason, setAddReason] = useState<PersonRestriction["reason"]>("sor_match");
  const [addNotes, setAddNotes] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  async function handleAdd() {
    setAddErr(null);
    setAddBusy(true);
    try {
      const token = await bearerToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/people/restrictions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          person_id: volunteer.id,
          reason: addReason,
          notes: addNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Could not add restriction");
      }
      const j = (await res.json()) as { restriction: PersonRestriction };
      onVolunteerUpdated({
        ...volunteer,
        restrictions: [...restrictions, j.restriction],
      });
      setAdding(false);
      setAddReason("sor_match");
      setAddNotes("");
    } catch (err) {
      setAddErr(err instanceof Error ? err.message : "Failed");
    } finally {
      setAddBusy(false);
    }
  }

  // ---- Lift ----
  const [liftBusyId, setLiftBusyId] = useState<string | null>(null);
  const [liftErr, setLiftErr] = useState<string | null>(null);

  async function handleLift(r: PersonRestriction) {
    if (!window.confirm(`Lift this restriction (${REASON_LABELS[r.reason]})? The row stays in the audit history.`)) {
      return;
    }
    setLiftErr(null);
    setLiftBusyId(r.id);
    try {
      const token = await bearerToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch(`/api/people/restrictions/${r.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          person_id: volunteer.id,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Could not lift");
      }
      const j = (await res.json()) as { lifted_at: string | null };
      onVolunteerUpdated({
        ...volunteer,
        restrictions: restrictions.map((x) =>
          x.id === r.id
            ? { ...x, lifted_at: j.lifted_at ?? new Date().toISOString() }
            : x,
        ),
      });
    } catch (err) {
      setLiftErr(err instanceof Error ? err.message : "Failed");
    } finally {
      setLiftBusyId(null);
    }
  }

  // ---- Log SOR check ----
  const [sorOpen, setSorOpen] = useState(false);
  const [sorMatchInput, setSorMatchInput] = useState<"clear" | "match">("clear");
  const [sorProvider, setSorProvider] = useState("");
  const [sorBusy, setSorBusy] = useState(false);
  const [sorErr, setSorErr] = useState<string | null>(null);

  async function handleLogSor() {
    setSorErr(null);
    setSorBusy(true);
    try {
      const token = await bearerToken();
      if (!token) throw new Error("Not signed in");
      const res = await fetch("/api/people/sor-check", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          person_id: volunteer.id,
          sor_match: sorMatchInput === "match",
          provider: sorProvider.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? "Could not log SOR check");
      }
      const j = (await res.json()) as {
        sor_match: boolean;
        last_sor_check_at: string;
      };
      onVolunteerUpdated({
        ...volunteer,
        background_check: {
          ...(volunteer.background_check ?? {
            status: "not_required",
            expires_at: null,
            provider: null,
            checked_at: null,
          }),
          sor_checked: true,
          sor_match: j.sor_match,
          last_sor_check_at: j.last_sor_check_at,
        },
      });
      setSorOpen(false);
      setSorProvider("");
    } catch (err) {
      setSorErr(err instanceof Error ? err.message : "Failed");
    } finally {
      setSorBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-vc-border-light bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="h-4 w-4 text-vc-coral"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
          />
        </svg>
        <p className="text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
          Safety
        </p>
      </div>

      {/* ---- Active restrictions ---- */}
      {active.length > 0 ? (
        <div className="space-y-2 mb-3">
          {active.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-vc-coral/40 bg-vc-coral/5 p-3"
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-vc-indigo">
                    {r.cannot_serve_with_children
                      ? "Cannot serve with children"
                      : "Active restriction"}
                  </p>
                  <p className="text-xs text-vc-text-muted mt-0.5">
                    {REASON_LABELS[r.reason]} · documented {fmtDate(r.documented_at)}
                  </p>
                  {r.notes && (
                    <p className="text-xs text-vc-text-secondary mt-1 whitespace-pre-wrap">
                      {r.notes}
                    </p>
                  )}
                </div>
                {isOwner && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleLift(r)}
                    disabled={liftBusyId === r.id}
                    className="min-h-[44px] flex-shrink-0"
                  >
                    {liftBusyId === r.id ? "Lifting…" : "Lift"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-vc-text-secondary mb-3">
          No active restrictions on file.
        </p>
      )}

      {liftErr && (
        <p className="text-xs text-vc-danger mb-2">{liftErr}</p>
      )}

      {/* ---- Add restriction (owner-only) ---- */}
      {isOwner && (
        <div className="mb-3">
          {!adding ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAdding(true)}
              className="min-h-[44px]"
            >
              Add restriction
            </Button>
          ) : (
            <div className="rounded-lg border border-vc-border-light bg-vc-bg-warm p-3 space-y-2">
              <label className="block text-xs font-medium text-vc-text-muted">
                Reason
                <select
                  value={addReason}
                  onChange={(e) =>
                    setAddReason(e.target.value as PersonRestriction["reason"])
                  }
                  className="mt-1 block w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none min-h-[44px]"
                >
                  <option value="sor_match">{REASON_LABELS.sor_match}</option>
                  <option value="policy">{REASON_LABELS.policy}</option>
                  <option value="other">{REASON_LABELS.other}</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-vc-text-muted">
                Notes (optional)
                <textarea
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  className="mt-1 block w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none"
                  placeholder="Reference IDs, court order URLs, etc. Avoid storing offense detail here."
                />
              </label>
              {addErr && <p className="text-xs text-vc-danger">{addErr}</p>}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={addBusy}
                  onClick={handleAdd}
                  className="min-h-[44px]"
                >
                  Save restriction
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setAdding(false);
                    setAddErr(null);
                  }}
                  className="min-h-[44px]"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- SOR check status + log affordance ---- */}
      <div className="border-t border-vc-border-light pt-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
              Sex Offender Registry check
            </p>
            <p className="text-sm text-vc-text-secondary mt-1">
              {sorChecked ? (
                <>
                  Last checked {fmtDate(bg?.last_sor_check_at)} —{" "}
                  <span
                    className={
                      sorMatch
                        ? "font-medium text-vc-danger"
                        : "font-medium text-vc-sage"
                    }
                  >
                    {sorMatch ? "Match" : "Clear"}
                  </span>
                </>
              ) : (
                "Never checked"
              )}
            </p>
          </div>
          {isOwner && !sorOpen && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSorOpen(true)}
              className="min-h-[44px]"
            >
              Log SOR check
            </Button>
          )}
        </div>

        {isOwner && sorOpen && (
          <div className="mt-3 rounded-lg border border-vc-border-light bg-vc-bg-warm p-3 space-y-2">
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium text-vc-text-muted">
                Result
              </legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="sor-result"
                  checked={sorMatchInput === "clear"}
                  onChange={() => setSorMatchInput("clear")}
                />{" "}
                Clear (no match)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="sor-result"
                  checked={sorMatchInput === "match"}
                  onChange={() => setSorMatchInput("match")}
                />{" "}
                Match (registry entry found)
              </label>
            </fieldset>
            <label className="block text-xs font-medium text-vc-text-muted">
              Provider (optional)
              <input
                type="text"
                value={sorProvider}
                onChange={(e) => setSorProvider(e.target.value)}
                maxLength={200}
                placeholder="e.g. MinistrySafe, manual"
                className="mt-1 block w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none min-h-[44px]"
              />
            </label>
            {sorErr && <p className="text-xs text-vc-danger">{sorErr}</p>}
            {sorMatchInput === "match" && (
              <p className="text-xs text-vc-text-secondary italic">
                Tip: after logging a match, add a restriction above with
                reason &ldquo;{REASON_LABELS.sor_match}&rdquo; to bar
                this person from children&rsquo;s ministries.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={sorBusy}
                onClick={handleLogSor}
                className="min-h-[44px]"
              >
                Save SOR check
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSorOpen(false);
                  setSorErr(null);
                  setSorProvider("");
                }}
                className="min-h-[44px]"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ---- Lifted (history) ---- */}
      {lifted.length > 0 && (
        <details className="mt-3 text-xs text-vc-text-secondary">
          <summary className="cursor-pointer text-vc-text-muted">
            Lifted history ({lifted.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {lifted.map((r) => (
              <li key={r.id}>
                {REASON_LABELS[r.reason]} — documented {fmtDate(r.documented_at)} ·
                lifted {fmtDate(r.lifted_at)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
