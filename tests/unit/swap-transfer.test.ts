/**
 * Wave 12 A hotfix regression coverage (Codex retest 2026-06-02 Sev 2).
 *
 * The initial W12-A ship transferred the assignment to the replacement
 * by writing only `volunteer_id`. But `/api/my-schedule` filters
 * assignments by `person_id`, so:
 *   - the original requester still saw the assignment in their list
 *   - the teammate who accepted did NOT see it in theirs
 *
 * `buildSwapTransferUpdate` pins the lockstep contract: BOTH
 * `person_id` and `volunteer_id` must move to the replacement's Person
 * doc id. If a future change drops either field, this test fails
 * before the regression hits prod again.
 */

import { describe, it, expect } from "vitest";
import { buildSwapTransferUpdate } from "@/lib/server/swap-transfer";

describe("buildSwapTransferUpdate", () => {
  const REPLACEMENT_ID = "person_w12_codex_w12_teammate_abc123";
  const NOW = "2026-06-02T13:14:15.000Z";

  it("writes person_id AND volunteer_id to the replacement id (no drift)", () => {
    // This is THE regression — Codex caught the case where only one
    // of these fields was being updated. Both must move together.
    const update = buildSwapTransferUpdate(REPLACEMENT_ID, NOW);
    expect(update.person_id).toBe(REPLACEMENT_ID);
    expect(update.volunteer_id).toBe(REPLACEMENT_ID);
    expect(update.person_id).toBe(update.volunteer_id);
  });

  it("stamps status=confirmed on the assignment", () => {
    // Accepting a swap auto-confirms the replacement — they don't
    // get a separate confirm flow. Locks the literal so a typo
    // ("Confirmed" / "active") can't slip in.
    const update = buildSwapTransferUpdate(REPLACEMENT_ID, NOW);
    expect(update.status).toBe("confirmed");
  });

  it("stamps the supplied ISO timestamp on updated_at", () => {
    // Caller passes new Date().toISOString(); we just thread it
    // through. Test confirms the param isn't dropped or rewritten.
    const update = buildSwapTransferUpdate(REPLACEMENT_ID, NOW);
    expect(update.updated_at).toBe(NOW);
  });

  it("returns only the four documented fields (no field leakage)", () => {
    // Firestore .update() merges fields; an accidental extra field
    // (e.g. role_title or schedule_id) would overwrite the existing
    // assignment doc's value. Keep the surface tiny.
    const update = buildSwapTransferUpdate(REPLACEMENT_ID, NOW);
    expect(Object.keys(update).sort()).toEqual(
      ["person_id", "status", "updated_at", "volunteer_id"].sort(),
    );
  });

  it("handles different person ids without leaking state", () => {
    const a = buildSwapTransferUpdate("person_a", NOW);
    const b = buildSwapTransferUpdate("person_b", NOW);
    expect(a.person_id).toBe("person_a");
    expect(a.volunteer_id).toBe("person_a");
    expect(b.person_id).toBe("person_b");
    expect(b.volunteer_id).toBe("person_b");
  });
});
