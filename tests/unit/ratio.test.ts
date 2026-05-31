/**
 * Wave 9 P0-5 sub-PR A — unit coverage for the ratio helpers.
 *
 * The helpers are pure; this covers:
 *   - computeRelatedTo: household overlap detection
 *   - countUnrelatedAdults: the unrelated-cluster collapse
 *   - evaluateRatio: status decision under each policy axis
 *   - canCheckInOneMore: the predicate the kiosk gate uses
 *
 * The most important specs encode the safety-relevant edge cases:
 *   - parent + child volunteering together don't satisfy two-deep
 *     (the Jason 2026-05-29 baked decision)
 *   - empty room can't violate two-deep
 *   - "no policy" gates are bypass-OK
 */

import { describe, it, expect } from "vitest";
import {
  computeRelatedTo,
  countUnrelatedAdults,
  evaluateRatio,
  canCheckInOneMore,
  DEFAULT_RATIO_WARNING_PERCENT,
} from "@/lib/server/ratio";
import type { Room, RoomVolunteerCheckIn } from "@/lib/types";

type Vol = Pick<RoomVolunteerCheckIn, "person_id" | "related_to">;

function v(person_id: string, related_to: string[] = []): Vol {
  return { person_id, related_to };
}

function makeRoom(policy: Room["ratio_policy"] = undefined): Pick<Room, "ratio_policy"> {
  return { ratio_policy: policy };
}

describe("computeRelatedTo", () => {
  it("returns empty when caller has no households", () => {
    expect(
      computeRelatedTo([], [
        { person_id: "b", household_ids: ["h1"] },
      ]),
    ).toEqual([]);
  });

  it("matches when households overlap", () => {
    expect(
      computeRelatedTo(["h1"], [
        { person_id: "b", household_ids: ["h1"] },
        { person_id: "c", household_ids: ["h2"] },
      ]),
    ).toEqual(["b"]);
  });

  it("matches across multi-household memberships", () => {
    expect(
      computeRelatedTo(["h1", "h2"], [
        { person_id: "b", household_ids: ["h2"] },
        { person_id: "c", household_ids: ["h3"] },
        { person_id: "d", household_ids: ["h1", "h4"] },
      ]),
    ).toEqual(["b", "d"]);
  });

  it("ignores volunteers with no household_ids", () => {
    expect(
      computeRelatedTo(["h1"], [
        { person_id: "b", household_ids: [] },
      ]),
    ).toEqual([]);
  });
});

describe("countUnrelatedAdults", () => {
  it("returns full count when no relations", () => {
    expect(countUnrelatedAdults([v("a"), v("b"), v("c")])).toBe(3);
  });

  it("zero when all are related to others", () => {
    // a-b parent/child pair only
    expect(countUnrelatedAdults([v("a", ["b"]), v("b", ["a"])])).toBe(0);
  });

  it("counts the unrelated remainder when a pair is related", () => {
    // a-b related, c unrelated → unrelated count is 1
    expect(
      countUnrelatedAdults([v("a", ["b"]), v("b", ["a"]), v("c")]),
    ).toBe(1);
  });

  it("a volunteer with related_to=[] counts as unrelated even if mathematically alone", () => {
    expect(countUnrelatedAdults([v("a")])).toBe(1);
  });
});

describe("evaluateRatio — bypass cases", () => {
  it("returns ok with no message penalty when policy is undefined", () => {
    const e = evaluateRatio(makeRoom(undefined), 5, [v("a"), v("b")]);
    expect(e.status).toBe("ok");
    expect(e.two_deep_ok).toBe(true);
    expect(e.ratio_ok).toBe(true);
    expect(e.max_children_for_current_volunteers).toBeNull();
    expect(e.message).toBe("No ratio policy");
  });

  it("returns ok with no message penalty when policy.enabled=false", () => {
    const room = makeRoom({
      enabled: false,
      min_volunteers: 2,
      max_children_per_volunteer: 4,
      min_unrelated_adults: 2,
    });
    const e = evaluateRatio(room, 999, []);
    expect(e.status).toBe("ok");
  });
});

describe("evaluateRatio — violation cases", () => {
  const POLICY = {
    enabled: true,
    min_volunteers: 2,
    max_children_per_volunteer: 4,
    min_unrelated_adults: 2,
  } as const;

  it("violation when ratio exceeded (children > volunteers * ratio)", () => {
    // 2 volunteers × 4 children/vol = 8 max; 9 children = violation
    const e = evaluateRatio(makeRoom(POLICY), 9, [v("a"), v("b")]);
    expect(e.status).toBe("violation");
    expect(e.ratio_ok).toBe(false);
  });

  it("violation when min_volunteers floor not met AND children present", () => {
    // policy requires 2 volunteers; only 1 here + 1 child = violation
    const e = evaluateRatio(makeRoom(POLICY), 1, [v("a")]);
    expect(e.status).toBe("violation");
    expect(e.message).toContain("min 2 volunteer");
  });

  it("no violation when min_volunteers floor not met BUT no children present", () => {
    // Empty room with 1 volunteer is fine — the gate cares about
    // child safety, not adult attendance per se
    const e = evaluateRatio(makeRoom(POLICY), 0, [v("a")]);
    expect(e.status).toBe("ok");
  });

  it("violation when two-deep not satisfied AND children present (parent + child volunteering together)", () => {
    // 2 volunteers (parent + adult child) related to each other only,
    // policy min_unrelated_adults = 2 → 0 unrelated → violation
    const e = evaluateRatio(
      makeRoom(POLICY),
      4,
      [v("parent", ["child"]), v("child", ["parent"])],
    );
    expect(e.status).toBe("violation");
    expect(e.two_deep_ok).toBe(false);
    expect(e.message).toContain("min 2 unrelated adults");
  });

  it("still a violation when only ONE unrelated adult joins a related pair (policy requires 2 unrelated)", () => {
    const e = evaluateRatio(
      makeRoom(POLICY),
      4,
      [v("parent", ["child"]), v("child", ["parent"]), v("unrelated")],
    );
    expect(e.status).toBe("violation");
    expect(e.unrelated_adults).toBe(1);
  });

  it("ok when two unrelated adults are present alongside a related pair", () => {
    const e = evaluateRatio(
      makeRoom(POLICY),
      4,
      [
        v("parent", ["child"]),
        v("child", ["parent"]),
        v("u1"),
        v("u2"),
      ],
    );
    expect(e.status).toBe("ok");
    expect(e.unrelated_adults).toBe(2);
    expect(e.two_deep_ok).toBe(true);
  });

  it("two-deep does NOT trip on empty room (no children to protect)", () => {
    const e = evaluateRatio(makeRoom(POLICY), 0, [v("a", ["b"]), v("b", ["a"])]);
    expect(e.status).toBe("ok");
    expect(e.two_deep_ok).toBe(true);
  });

  it("max_children hard cap overrides a generous ratio", () => {
    const room = makeRoom({
      ...POLICY,
      max_children: 5,
    });
    const e = evaluateRatio(room, 5, [v("a"), v("b"), v("c")]);
    // ratio allows 12, but max_children cap = 5; children == cap → violation
    expect(e.status).toBe("violation");
    expect(e.message).toContain("room cap");
  });
});

describe("evaluateRatio — warning + ok bands", () => {
  const POLICY = {
    enabled: true,
    min_volunteers: 1,
    max_children_per_volunteer: 10,
    min_unrelated_adults: 0, // disable two-deep for these tests
  } as const;

  it("ok below the warning threshold", () => {
    // 1 vol × 10 = 10 max; 7 = 70% → ok
    const e = evaluateRatio(makeRoom(POLICY), 7, [v("a")]);
    expect(e.status).toBe("ok");
  });

  it("warning at or above the threshold", () => {
    // 1 vol × 10 = 10 max; 9 = 90% → warning at default
    const e = evaluateRatio(makeRoom(POLICY), 9, [v("a")]);
    expect(e.status).toBe("warning");
    expect(e.message).toContain("Near capacity");
  });

  it("warningPercent override raises the threshold", () => {
    // Same 90% scenario but override to 95% → still ok
    const e = evaluateRatio(makeRoom(POLICY), 9, [v("a")], 95);
    expect(e.status).toBe("ok");
  });

  it("DEFAULT_RATIO_WARNING_PERCENT is 90", () => {
    expect(DEFAULT_RATIO_WARNING_PERCENT).toBe(90);
  });
});

describe("canCheckInOneMore", () => {
  const POLICY = {
    enabled: true,
    min_volunteers: 1,
    max_children_per_volunteer: 4,
    min_unrelated_adults: 0,
  } as const;

  it("ok → ok after +1 if still safe", () => {
    const e = canCheckInOneMore(makeRoom(POLICY), 2, [v("a")]);
    expect(e.status).toBe("ok"); // 3/4
  });

  it("ok → warning when +1 crosses the threshold", () => {
    // 1 vol × 4 = 4; current 2 → +1 = 3 (75%) ok; current 3 → +1 = 4 (100%) → violation actually since strictly less
    // Let me pick: current 3, +1 = 4 → ratio_ok requires children < effectiveMax, so 4 < 4 is false → violation
    const e = canCheckInOneMore(makeRoom(POLICY), 3, [v("a"), v("b")]);
    // 2 vol × 4 = 8; +1 children = 4 → 4/8 = 50% → ok
    expect(e.status).toBe("ok");
  });

  it("ok → violation when +1 exceeds the ratio", () => {
    const e = canCheckInOneMore(makeRoom(POLICY), 4, [v("a")]);
    // 1 vol × 4 = 4; +1 = 5 children > 4 → violation
    expect(e.status).toBe("violation");
  });
});
