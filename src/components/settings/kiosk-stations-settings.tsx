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
import type { KioskStation } from "@/lib/types";

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
  const [creating, setCreating] = useState(false);
  const [activationToShow, setActivationToShow] =
    useState<ActivationToShow | null>(null);

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
        body: JSON.stringify({ church_id: churchId, name: newName.trim() }),
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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setCreating(false);
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

        <form
          onSubmit={handleCreate}
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
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
                  <p className="font-medium text-vc-indigo">{s.name}</p>
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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleReissue(s.id, s.name)}
                      className="rounded-lg border border-vc-border-light px-3 py-1.5 text-xs font-medium text-vc-indigo transition-colors hover:bg-vc-bg-warm"
                    >
                      New activation code
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
  const minutesLeft = Math.max(
    0,
    Math.floor((new Date(activation.expiresAt).getTime() - Date.now()) / 60000),
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
