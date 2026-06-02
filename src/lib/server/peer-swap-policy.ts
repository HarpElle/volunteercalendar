/**
 * Wave 12 D — pure predicate for "is peer-swap allowed on this team?"
 *
 * Centralizes the default-true semantics so the server route, the
 * client button, and any future surface all read the same answer.
 * Legacy ministries created before the field existed simply lack
 * the property; that must read as "allowed" so we don't silently
 * disable swaps for orgs that haven't visited team settings yet.
 *
 * Pulled out as a one-liner because it's used in 3+ places and
 * "default true on undefined" is exactly the kind of subtlety that
 * gets flipped wrong (`!!flag` would read undefined as false).
 */

import type { Ministry } from "@/lib/types";

export function isPeerSwapAllowed(
  ministry: Pick<Ministry, "allow_peer_swap"> | null | undefined,
): boolean {
  if (!ministry) {
    // Defensive — if we can't find the ministry, fail OPEN. Hiding
    // the button silently is worse than showing it; worst case the
    // POST will 404 on a stale ministry id and the user sees a
    // useful error.
    return true;
  }
  // Explicit false-check so undefined → true. Don't use !! — that
  // would treat legacy docs as disabled.
  return ministry.allow_peer_swap !== false;
}
