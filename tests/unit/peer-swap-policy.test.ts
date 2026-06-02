/**
 * Wave 12 D — pins the default-true semantics of isPeerSwapAllowed.
 *
 * The whole point of this helper is to handle the subtle case:
 * legacy ministries created before W12-D simply DON'T HAVE the
 * `allow_peer_swap` field. They should default to ALLOWED so we
 * don't silently turn off swap requests for every org that hasn't
 * yet visited team settings. A `!!ministry.allow_peer_swap` check
 * would get this wrong (treating undefined as false). This test
 * pins the correct behavior so a one-character "fix" can't slip in.
 */

import { describe, it, expect } from "vitest";
import { isPeerSwapAllowed } from "@/lib/server/peer-swap-policy";

describe("isPeerSwapAllowed", () => {
  it("returns true when allow_peer_swap is explicitly true", () => {
    expect(isPeerSwapAllowed({ allow_peer_swap: true })).toBe(true);
  });

  it("returns false when allow_peer_swap is explicitly false", () => {
    expect(isPeerSwapAllowed({ allow_peer_swap: false })).toBe(false);
  });

  it("returns true when allow_peer_swap is undefined (legacy ministry)", () => {
    // THE regression — undefined must read as ALLOWED, not disabled.
    expect(isPeerSwapAllowed({ allow_peer_swap: undefined })).toBe(true);
  });

  it("returns true on a ministry doc with no allow_peer_swap key at all", () => {
    expect(isPeerSwapAllowed({})).toBe(true);
  });

  it("returns true (fail-open) when ministry is null", () => {
    // Defensive case — if the assignment references a deleted or
    // stale ministry, we don't silently hide the button. POST will
    // 404 with a useful error if needed.
    expect(isPeerSwapAllowed(null)).toBe(true);
  });

  it("returns true (fail-open) when ministry is undefined", () => {
    expect(isPeerSwapAllowed(undefined)).toBe(true);
  });
});
