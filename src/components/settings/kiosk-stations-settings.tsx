"use client";

/**
 * Kiosk Stations admin UI (Track B).
 *
 * Lets owners/admins enroll a kiosk device, view enrolled stations, reissue
 * a fresh activation code if one is lost, or revoke a station to immediately
 * disable a kiosk. The activation code is shown once when the station is
 * created or reissued — operators take the code to the kiosk device.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { KioskStation, KioskStationType } from "@/lib/types";

function stationTypeLabel(type: KioskStationType | undefined): string {
  if (type === "staffed") return "Staffed";
  // Legacy or self_service both render as the relevant label.
  return type === "self_service" ? "Self-service" : "Staffed (legacy)";
}

interface ActivationToShow {
  stationName: string;
  code: string;
  expiresAt: string;
}

export function KioskStationsSettings({ churchId }: { churchId: string }) {
  const { user } = useAuth();
  const [stations, setStations] = useState<KioskStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  // P0-1: station type drives token scope. Default to "self_service" — the
  // safer default (excludes "checkout" from the kiosk's capabilities until
  // an admin explicitly enrolls a staffed station for releases).
  const [newType, setNewType] = useState<KioskStationType>("self_service");
  const [creating, setCreating] = useState(false);
  const [activationToShow, setActivationToShow] =
    useState<ActivationToShow | null>(null);
  // Per-station test-print state (2026-06-04). Keyed by station id;
  // each entry tracks the in-flight command's id + status while we
  // poll for the result. Auto-clears 6s after the kiosk reports back.
  const [testPrint, setTestPrint] = useState<
    Record<string, {
      commandId: string;
      status: "pending" | "completed" | "failed";
      error?: string;
    }>
  >({});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/kiosk/stations?church_id=${encodeURIComponent(churchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load stations");
      }
      const data = await res.json();
      setStations(data.stations || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!user || !newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/kiosk/stations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          church_id: churchId,
          name: newName.trim(),
          type: newType,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create station");
      }
      const data = await res.json();
      setActivationToShow({
        stationName: data.station.name,
        code: data.activation_code,
        expiresAt: data.activation_expires_at,
      });
      setNewName("");
      setNewType("self_service");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  }

  async function handleChangeType(
    stationId: string,
    stationName: string,
    currentType: KioskStationType | undefined,
  ) {
    if (!user) return;
    const targetType: KioskStationType =
      currentType === "staffed" ? "self_service" : "staffed";
    const targetLabel = stationTypeLabel(targetType);
    if (
      !confirm(
        `Change "${stationName}" to a ${targetLabel} station? ` +
          `This will revoke the current device's access and you'll need to ` +
          `re-activate it with a new code. The kiosk goes dark until then.`,
      )
    )
      return;
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/kiosk/stations/${stationId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          church_id: churchId,
          action: "change_type",
          type: targetType,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to change station type");
      }
      const data = await res.json();
      setActivationToShow({
        stationName,
        code: data.activation_code,
        expiresAt: data.activation_expires_at,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleReissue(stationId: string, stationName: string) {
    if (!user) return;
    if (
      !confirm(
        `Generate a new activation code for "${stationName}"? Any previously issued code that hasn't been used yet will still work until it expires.`,
      )
    )
      return;
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/kiosk/stations/${stationId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ church_id: churchId, action: "reissue" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to reissue code");
      }
      const data = await res.json();
      setActivationToShow({
        stationName,
        code: data.activation_code,
        expiresAt: data.activation_expires_at,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handleRevoke(stationId: string, stationName: string) {
    if (!user) return;
    if (
      !confirm(
        `Revoke "${stationName}"? The kiosk will stop working immediately and you'll need to enroll a fresh device to use this slot again.`,
      )
    )
      return;
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/kiosk/stations/${stationId}?church_id=${encodeURIComponent(churchId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to revoke");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  const handleSendTestPrint = useCallback(
    async (stationId: string) => {
      if (!user) return;
      setTestPrint((prev) => ({
        ...prev,
        [stationId]: { commandId: "", status: "pending" },
      }));
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/kiosk-commands", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            church_id: churchId,
            target_station_id: stationId,
            type: "test_print",
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Server returned ${res.status}`);
        }
        const { command } = await res.json();
        setTestPrint((prev) => ({
          ...prev,
          [stationId]: { commandId: command.id, status: "pending" },
        }));

        // Poll for result. Kiosk polls every 15s, so we wait up to
        // ~30s before giving up. Show "Sending..." in the meantime;
        // kiosk reports completed/failed via PATCH.
        const deadline = Date.now() + 30_000;
        const poll = async () => {
          if (Date.now() > deadline) {
            setTestPrint((prev) => ({
              ...prev,
              [stationId]: {
                commandId: command.id,
                status: "failed",
                error: "Kiosk didn't respond within 30 seconds — it may be offline",
              },
            }));
            return;
          }
          try {
            const pollRes = await fetch(
              `/api/admin/kiosk-commands/${command.id}?church_id=${encodeURIComponent(churchId)}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (pollRes.ok) {
              const data = await pollRes.json();
              const cmd = data.command;
              if (cmd.status === "completed") {
                setTestPrint((prev) => ({
                  ...prev,
                  [stationId]: { commandId: command.id, status: "completed" },
                }));
                setTimeout(
                  () =>
                    setTestPrint((prev) => {
                      const { [stationId]: _drop, ...rest } = prev;
                      return rest;
                    }),
                  6_000,
                );
                return;
              }
              if (cmd.status === "failed") {
                setTestPrint((prev) => ({
                  ...prev,
                  [stationId]: {
                    commandId: command.id,
                    status: "failed",
                    error: cmd.error_message || "Test print failed",
                  },
                }));
                return;
              }
            }
          } catch {
            // ignore — try again next tick
          }
          setTimeout(poll, 2_000);
        };
        setTimeout(poll, 2_000);
      } catch (err) {
        setTestPrint((prev) => ({
          ...prev,
          [stationId]: {
            commandId: "",
            status: "failed",
            error: err instanceof Error ? err.message : "Unknown error",
          },
        }));
      }
    },
    [user, churchId],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-vc-border-light bg-white p-6">
        <h2 className="font-display text-xl text-vc-indigo">Kiosk Stations</h2>
        <p className="mt-1 text-sm text-vc-text-secondary">
          Each iPad or device that runs the children&apos;s check-in kiosk is
          an enrolled <strong>station</strong>. Enrolling generates a one-time
          8-character activation code; type that code into the device&apos;s
          kiosk page within 10 minutes to bind it. Revoking a station
          immediately disables that device.
        </p>

        <form onSubmit={handleCreate} className="mt-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Input
                label="Station name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Lobby Kiosk"
                required
                maxLength={60}
                disabled={creating}
              />
            </div>
            <Button
              type="submit"
              disabled={creating || !newName.trim()}
              variant="primary"
            >
              {creating ? "Enrolling…" : "Enroll new station"}
            </Button>
          </div>

          {/* P0-1: station type selector */}
          <fieldset
            className="rounded-lg border border-vc-border-light p-4"
            disabled={creating}
          >
            <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
              Station type
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors ${
                  newType === "self_service"
                    ? "border-vc-indigo bg-vc-indigo/5"
                    : "border-vc-border-light hover:border-vc-indigo/40"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="station-type"
                    value="self_service"
                    checked={newType === "self_service"}
                    onChange={() => setNewType("self_service")}
                    className="text-vc-indigo"
                  />
                  <strong className="text-vc-indigo">Self-service</strong>
                </span>
                <span className="text-xs text-vc-text-secondary">
                  Unattended kiosk in the lobby. Children are checked IN here;
                  checkout happens at a staffed station only.
                </span>
              </label>
              <label
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors ${
                  newType === "staffed"
                    ? "border-vc-indigo bg-vc-indigo/5"
                    : "border-vc-border-light hover:border-vc-indigo/40"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="station-type"
                    value="staffed"
                    checked={newType === "staffed"}
                    onChange={() => setNewType("staffed")}
                    className="text-vc-indigo"
                  />
                  <strong className="text-vc-indigo">Staffed</strong>
                </span>
                <span className="text-xs text-vc-text-secondary">
                  Operated by a check-in volunteer. Handles both check-in and
                  checkout. Use for the children&apos;s wing release station.
                </span>
              </label>
            </div>
          </fieldset>
        </form>

        {error && (
          <p className="mt-3 text-sm text-vc-coral">⚠ {error}</p>
        )}
      </div>

      {/* Activation code modal */}
      {activationToShow && (
        <ActivationCodeModal
          activation={activationToShow}
          onClose={() => setActivationToShow(null)}
        />
      )}

      {/* List of stations */}
      <div className="rounded-xl border border-vc-border-light bg-white">
        <div className="flex items-center justify-between border-b border-vc-border-light px-5 py-4">
          <h3 className="font-semibold text-vc-indigo">
            Enrolled stations{" "}
            <span className="ml-2 text-xs font-normal text-vc-text-muted">
              {stations.length}
            </span>
          </h3>
        </div>
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : stations.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-vc-text-secondary">
            No stations enrolled yet. Enroll your first kiosk above.
          </p>
        ) : (
          <ul className="divide-y divide-vc-border-light">
            {stations.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="flex-1 min-w-[200px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-vc-indigo">{s.name}</p>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                        s.type === "staffed"
                          ? "bg-vc-coral/10 text-vc-coral"
                          : "bg-vc-indigo/10 text-vc-indigo"
                      }`}
                      title={
                        s.type === "staffed"
                          ? "Handles both check-in and checkout"
                          : "Check-in only — checkout at staffed station"
                      }
                    >
                      {stationTypeLabel(s.type)}
                    </span>
                  </div>
                  <p className="text-xs text-vc-text-muted">
                    {s.status === "revoked" ? (
                      <span className="text-vc-coral">Revoked</span>
                    ) : s.active_token_id ? (
                      <span className="text-vc-sage">Active</span>
                    ) : (
                      <span className="text-vc-warning">Awaiting activation</span>
                    )}
                    {" · "}
                    {s.last_used_at
                      ? `Last used ${formatRelative(s.last_used_at)}`
                      : "Never used"}
                  </p>
                </div>
                {s.status === "active" && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleChangeType(s.id, s.name, s.type)}
                      className="rounded-lg border border-vc-border-light px-3 py-1.5 text-xs font-medium text-vc-indigo transition-colors hover:bg-vc-bg-warm"
                      title="Switch between self-service and staffed (revokes the device's current activation)"
                    >
                      {s.type === "staffed"
                        ? "Change to Self-service"
                        : "Change to Staffed"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReissue(s.id, s.name)}
                      className="rounded-lg border border-vc-border-light px-3 py-1.5 text-xs font-medium text-vc-indigo transition-colors hover:bg-vc-bg-warm"
                    >
                      New activation code
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendTestPrint(s.id)}
                      disabled={testPrint[s.id]?.status === "pending"}
                      className="rounded-lg border border-vc-border-light px-3 py-1.5 text-xs font-medium text-vc-indigo transition-colors hover:bg-vc-bg-warm disabled:opacity-50"
                      title="Send a test label to this kiosk's printer"
                    >
                      {testPrint[s.id]?.status === "pending"
                        ? "Sending…"
                        : "Send test print"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(s.id, s.name)}
                      className="rounded-lg border border-vc-coral/40 px-3 py-1.5 text-xs font-medium text-vc-coral transition-colors hover:bg-vc-coral/5"
                    >
                      Revoke
                    </button>
                  </div>
                )}
                {testPrint[s.id]?.status === "completed" && (
                  <p className="w-full text-xs text-vc-sage font-medium pl-1">
                    ✓ Test label printed
                  </p>
                )}
                {testPrint[s.id]?.status === "failed" && (
                  <p className="w-full text-xs text-red-600 pl-1">
                    Test failed: {testPrint[s.id]?.error ?? "unknown error"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActivationCodeModal({
  activation,
  onClose,
}: {
  activation: ActivationToShow;
  onClose: () => void;
}) {
  // Snapshot the minutes-left at mount so the value doesn't drift while the
  // modal is open. Acceptable UX since the modal is meant to be closed
  // shortly after the operator types the code into the kiosk.
  const [minutesLeft] = useState(() =>
    Math.max(
      0,
      Math.floor(
        (new Date(activation.expiresAt).getTime() - Date.now()) / 60000,
      ),
    ),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-vc-indigo/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-2xl text-vc-indigo">
          Activation code for {activation.stationName}
        </h3>
        <p className="mt-2 text-sm text-vc-text-secondary">
          Enter this code on the kiosk device&apos;s activation screen within{" "}
          <strong>{minutesLeft} minute{minutesLeft === 1 ? "" : "s"}</strong>.
          You won&apos;t be able to view this code again — keep this dialog
          open until the kiosk is enrolled.
        </p>
        <div className="my-6 rounded-xl bg-vc-bg-warm py-6 text-center">
          <p className="font-mono text-4xl font-bold tracking-[0.3em] text-vc-indigo">
            {activation.code}
          </p>
        </div>
        <p className="text-xs text-vc-text-muted">
          On the kiosk device, open{" "}
          <code className="rounded bg-vc-bg-warm px-1 py-0.5">
            volunteercal.com/kiosk
          </code>{" "}
          and enter the code above when prompted.
        </p>
        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
