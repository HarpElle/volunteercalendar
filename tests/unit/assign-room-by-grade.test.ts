/**
 * Tests for the grade-based room assignment contract used by the kiosk
 * check-in route + lookup.
 *
 * Pins the regression Codex flagged after PR #11: a child with grade
 * "kindergarten" landed in "Unassigned" even when a check-in room was
 * configured with `default_grades: ["kindergarten", "1st", "2nd"]`. The
 * root cause was that the kiosk check-in route only resolved a room via
 * (a) operator override or (b) the child's own `default_room_id`, with no
 * fallback to the room's `default_grades` contract.
 *
 * `assignRoomByGrade` queries `rooms` where `default_grades` array-contains
 * the child's grade and returns the first room (alphabetic by name) with
 * available capacity. Rooms with no capacity are unlimited; inactive rooms
 * are skipped; ties fall back to the first match when everything is full.
 *
 * These tests use an in-memory fake Firestore so the contract stays locked
 * in without booting the emulator.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { assignRoomByGrade } from "@/lib/server/checkin-helpers";

// ---------------------------------------------------------------------------
// Minimal in-memory Firestore fake
// ---------------------------------------------------------------------------

interface FakeRoomDoc {
  id: string;
  data: Record<string, unknown>;
}

interface FakeSessionDoc {
  id: string;
  data: Record<string, unknown>;
}

function makeFakeChurchRef(rooms: FakeRoomDoc[], sessions: FakeSessionDoc[] = []) {
  return {
    collection(name: string) {
      if (name === "rooms") {
        return {
          where(_field: string, _op: string, value: unknown) {
            return {
              async get() {
                const matched = rooms.filter((r) => {
                  const grades = (r.data.default_grades as string[]) || [];
                  return grades.includes(value as string);
                });
                return {
                  empty: matched.length === 0,
                  docs: matched.map((r) => ({ id: r.id, data: () => r.data })),
                };
              },
            };
          },
        };
      }
      if (name === "checkInSessions") {
        const filters: { field: string; op: string; value: unknown }[] = [];
        const chain = {
          where(field: string, op: string, value: unknown) {
            filters.push({ field, op, value });
            return chain;
          },
          count() {
            return {
              async get() {
                const count = sessions.filter((s) =>
                  filters.every((f) => {
                    if (f.op !== "==") return true;
                    return (s.data as Record<string, unknown>)[f.field] === f.value;
                  }),
                ).length;
                return { data: () => ({ count }) };
              },
            };
          },
        };
        return chain;
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
  } as unknown as Parameters<typeof assignRoomByGrade>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("assignRoomByGrade", () => {
  it("returns null when grade is empty", async () => {
    const ref = makeFakeChurchRef([
      { id: "r1", data: { name: "Kids Room", default_grades: ["kindergarten"], is_active: true } },
    ]);
    expect(await assignRoomByGrade(ref, undefined, "2026-05-17")).toBeNull();
    expect(await assignRoomByGrade(ref, "", "2026-05-17")).toBeNull();
  });

  it("returns null when no room matches the grade", async () => {
    const ref = makeFakeChurchRef([
      { id: "r1", data: { name: "Older Kids", default_grades: ["5th", "6th"], is_active: true } },
    ]);
    expect(await assignRoomByGrade(ref, "kindergarten", "2026-05-17")).toBeNull();
  });

  it("returns the single matching room for the grade (the Codex case)", async () => {
    const ref = makeFakeChurchRef([
      {
        id: "kids-room-pr10",
        data: {
          name: "Kids Room PR10 124407",
          default_grades: ["kindergarten", "1st", "2nd"],
          capacity: 12,
          is_active: true,
        },
      },
    ]);
    const out = await assignRoomByGrade(ref, "kindergarten", "2026-05-17");
    expect(out?.id).toBe("kids-room-pr10");
    expect(out?.name).toBe("Kids Room PR10 124407");
    expect(out?.capacity).toBe(12);
  });

  it("normalizes 'pre_k' to 'pre-k' when matching", async () => {
    // Visitor registration historically emitted underscores; the helper
    // should accept either.
    const ref = makeFakeChurchRef([
      { id: "r1", data: { name: "Preschool", default_grades: ["pre-k"], is_active: true } },
    ]);
    expect((await assignRoomByGrade(ref, "pre_k", "2026-05-17"))?.id).toBe("r1");
  });

  it("skips inactive rooms", async () => {
    const ref = makeFakeChurchRef([
      { id: "r1", data: { name: "Old Room", default_grades: ["kindergarten"], is_active: false } },
      { id: "r2", data: { name: "New Room", default_grades: ["kindergarten"], is_active: true } },
    ]);
    expect((await assignRoomByGrade(ref, "kindergarten", "2026-05-17"))?.id).toBe("r2");
  });

  it("treats missing is_active as active (legacy data)", async () => {
    const ref = makeFakeChurchRef([
      { id: "r1", data: { name: "Legacy Room", default_grades: ["kindergarten"] } },
    ]);
    expect((await assignRoomByGrade(ref, "kindergarten", "2026-05-17"))?.id).toBe("r1");
  });

  it("returns the alphabetically-first room when multiple match and none are full", async () => {
    const ref = makeFakeChurchRef([
      { id: "rb", data: { name: "Beta Room", default_grades: ["kindergarten"], capacity: 10, is_active: true } },
      { id: "ra", data: { name: "Alpha Room", default_grades: ["kindergarten"], capacity: 10, is_active: true } },
    ]);
    expect((await assignRoomByGrade(ref, "kindergarten", "2026-05-17"))?.id).toBe("ra");
  });

  it("rolls to the next room when the first match is at capacity", async () => {
    const sessions = [
      // 2 active sessions in Alpha Room — capacity 2 means it's full.
      { id: "s1", data: { room_id: "ra", service_date: "2026-05-17", checked_out_at: null } },
      { id: "s2", data: { room_id: "ra", service_date: "2026-05-17", checked_out_at: null } },
    ];
    const ref = makeFakeChurchRef(
      [
        { id: "ra", data: { name: "Alpha Room", default_grades: ["kindergarten"], capacity: 2, is_active: true } },
        { id: "rb", data: { name: "Beta Room", default_grades: ["kindergarten"], capacity: 10, is_active: true } },
      ],
      sessions,
    );
    expect((await assignRoomByGrade(ref, "kindergarten", "2026-05-17"))?.id).toBe("rb");
  });

  it("rooms with no capacity are treated as unlimited and chosen if alphabetic-first", async () => {
    const ref = makeFakeChurchRef([
      { id: "ra", data: { name: "Alpha Room", default_grades: ["kindergarten"], is_active: true } },
      { id: "rb", data: { name: "Beta Room", default_grades: ["kindergarten"], capacity: 10, is_active: true } },
    ]);
    expect((await assignRoomByGrade(ref, "kindergarten", "2026-05-17"))?.id).toBe("ra");
  });

  it("falls back to the first match when every candidate is full", async () => {
    // Better than dropping the child into Unassigned silently — downstream
    // capacity SMS/overflow handling still has something to work with.
    const sessions = [
      { id: "s1", data: { room_id: "ra", service_date: "2026-05-17", checked_out_at: null } },
      { id: "s2", data: { room_id: "rb", service_date: "2026-05-17", checked_out_at: null } },
    ];
    const ref = makeFakeChurchRef(
      [
        { id: "ra", data: { name: "Alpha Room", default_grades: ["kindergarten"], capacity: 1, is_active: true } },
        { id: "rb", data: { name: "Beta Room", default_grades: ["kindergarten"], capacity: 1, is_active: true } },
      ],
      sessions,
    );
    const out = await assignRoomByGrade(ref, "kindergarten", "2026-05-17");
    expect(out?.id).toBe("ra");
  });
});
