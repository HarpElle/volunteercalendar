"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useWakeLock } from "@/lib/hooks/use-wake-lock";
import { RoomChildCard } from "@/components/checkin/room-child-card";
import { AllergyDetailModal } from "@/components/checkin/allergy-detail-modal";

interface RoomChild {
  session_id: string;
  child_id: string;
  child_name: string;
  grade?: string;
  checked_in_at: string;
  checked_out_at: string | null;
  has_alerts: boolean;
  allergies?: string;
  medical_notes?: string;
  is_late: boolean;
  parent_phone_masked: string;
}

interface RoomData {
  room: { id: string; name: string; capacity: number | null };
  date: string;
  children: RoomChild[];
  total_checked_in: number;
  total_checked_out: number;
}

const POLL_INTERVAL = 5_000; // 5 seconds

/**
 * /checkin/room/[roomId] — Teacher room view.
 *
 * Query params:
 *   token      — room view token (for auth)
 *   church_id  — required
 *   date       — optional (defaults to today)
 *
 * Polls every 5s for real-time updates.
 * Inherits blank layout from /checkin/layout.tsx.
 */
export default function RoomViewPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const roomId = params.roomId as string;
  const token = searchParams.get("token") || "";
  const churchId = searchParams.get("church_id") || "";
  const date =
    searchParams.get("date") || new Date().toISOString().split("T")[0];

  const [data, setData] = useState<RoomData | null>(null);
  const [error, setError] = useState("");
  const [selectedChild, setSelectedChild] = useState<RoomChild | null>(null);
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);

  // Keep screen awake for teacher room view
  useWakeLock();

  const fetchData = useCallback(async () => {
    if (!roomId || !token || !churchId) return;

    try {
      const url = `/api/checkin/room/${roomId}?token=${encodeURIComponent(token)}&church_id=${encodeURIComponent(churchId)}&date=${date}`;
      const res = await fetch(url);

      if (!res.ok) {
        const json = await res.json();
        setError(json.error || "Failed to load room data");
        return;
      }

      const json = (await res.json()) as RoomData;
      setData(json);
      setError("");
    } catch {
      setError("Network error");
    }
  }, [roomId, token, churchId, date]);

  const handleTeacherCheckout = useCallback(async (sessionId: string) => {
    if (!roomId || !token || !churchId) return;
    setCheckingOutId(sessionId);
    try {
      const res = await fetch("/api/checkin/room-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          church_id: churchId,
          room_id: roomId,
          token,
          session_id: sessionId,
        }),
      });
      if (res.ok) {
        await fetchData();
      }
    } catch {
      // Silent — next poll will catch up
    } finally {
      setCheckingOutId(null);
    }
  }, [roomId, token, churchId, fetchData]);

  // Initial fetch + polling
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!churchId || !token) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500 text-lg">
          Missing church_id or token parameter.
        </p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-600 font-medium text-lg mb-2">{error}</p>
          <button
            type="button"
            onClick={fetchData}
            className="text-vc-coral underline font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 border-4 border-vc-coral/30 border-t-vc-coral rounded-full animate-spin" />
      </div>
    );
  }

  const activeChildren = data.children.filter((c) => !c.checked_out_at);
  const checkedOutChildren = data.children.filter((c) => c.checked_out_at);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h1 className="text-2xl font-bold text-vc-indigo font-display">
            {data.room.name}
          </h1>
          <p className="text-sm text-gray-500">
            {new Date(data.date + "T12:00:00").toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-vc-indigo">
              {data.total_checked_in}
            </p>
            <p className="text-xs text-gray-500">Checked In</p>
          </div>
          {data.room.capacity && (
            <div className="text-center">
              <p
                className={`text-2xl font-bold ${
                  data.total_checked_in >= data.room.capacity
                    ? "text-red-600"
                    : data.total_checked_in >= data.room.capacity * 0.8
                      ? "text-amber-600"
                      : "text-vc-sage"
                }`}
              >
                /{data.room.capacity}
              </p>
              <p className="text-xs text-gray-500">Capacity</p>
            </div>
          )}
        </div>
      </div>

      {/* Child list */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeChildren.length === 0 && checkedOutChildren.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-lg">No children checked in yet</p>
          </div>
        )}

        {activeChildren.length > 0 && (
          <div className="space-y-2 mb-6">
            {activeChildren.map((child) => (
              <RoomChildCard
                key={child.session_id}
                childName={child.child_name}
                grade={child.grade}
                checkedInAt={child.checked_in_at}
                checkedOutAt={child.checked_out_at}
                hasAlerts={child.has_alerts}
                allergies={child.allergies}
                medicalNotes={child.medical_notes}
                isLate={child.is_late}
                parentPhoneMasked={child.parent_phone_masked}
                onTap={() => setSelectedChild(child)}
                onCheckout={() => handleTeacherCheckout(child.session_id)}
                checkingOut={checkingOutId === child.session_id}
              />
            ))}
          </div>
        )}

        {checkedOutChildren.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-2 mt-4">
              <div className="flex-grow border-t border-gray-200" />
              <span className="text-xs text-gray-400 uppercase tracking-wide">
                Checked Out ({checkedOutChildren.length})
              </span>
              <div className="flex-grow border-t border-gray-200" />
            </div>
            <div className="space-y-2">
              {checkedOutChildren.map((child) => (
                <RoomChildCard
                  key={child.session_id}
                  childName={child.child_name}
                  grade={child.grade}
                  checkedInAt={child.checked_in_at}
                  checkedOutAt={child.checked_out_at}
                  hasAlerts={child.has_alerts}
                  allergies={child.allergies}
                  medicalNotes={child.medical_notes}
                  isLate={child.is_late}
                  parentPhoneMasked={child.parent_phone_masked}
                  onTap={() => setSelectedChild(child)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Allergy detail modal */}
      {selectedChild && (
        <AllergyDetailModal
          childName={selectedChild.child_name}
          allergies={selectedChild.allergies}
          medicalNotes={selectedChild.medical_notes}
          parentPhoneMasked={selectedChild.parent_phone_masked}
          onClose={() => setSelectedChild(null)}
        />
      )}
    </div>
  );
}
