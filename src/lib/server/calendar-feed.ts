import type { Firestore, DocumentReference } from "firebase-admin/firestore";

/**
 * Shared helpers for calendar feed access (Pass G Phase 3).
 *
 * - Honors revoked_at (returns null from the lookup so the route can 404)
 * - Updates last_accessed_at fire-and-forget on every read
 * - Clamps a requested date range to a max window (default 1 year) so a
 *   malicious caller can't request 100 years of events and DoS the route
 */

const MAX_FEED_RANGE_DAYS = 365;

/**
 * Update last_accessed_at on a calendar feed doc. Fire-and-forget — the
 * caller continues serving the feed even if the write fails. Use after
 * any successful read from a feed's token.
 */
export function touchFeedLastAccessed(feedRef: DocumentReference): void {
  feedRef
    .update({ last_accessed_at: new Date().toISOString() })
    .catch((err) => {
      // Non-fatal — don't block the iCal response.
      console.warn("[calendar-feed] touch last_accessed_at failed:", err);
    });
}

/**
 * Update last_accessed_at on a room's calendar feed (rooms store the
 * token on the room doc itself, not in calendar_feeds collection).
 */
export function touchRoomLastAccessed(
  db: Firestore,
  churchId: string,
  roomId: string,
): void {
  db.doc(`churches/${churchId}/rooms/${roomId}`)
    .update({ calendar_last_accessed_at: new Date().toISOString() })
    .catch((err) => {
      console.warn("[calendar-feed] touch room last_accessed_at failed:", err);
    });
}

/**
 * Clamps a requested date range to MAX_FEED_RANGE_DAYS days. Returns
 * the parsed Date pair plus a flag indicating whether clamping
 * happened (so the caller can decide whether to log).
 *
 * If the request is missing dates entirely, defaults to "30 days
 * back, 90 days forward" — common iCal-client expectation.
 */
export function clampFeedDateRange(
  fromRaw: string | null,
  toRaw: string | null,
): { from: Date; to: Date; clamped: boolean } {
  const now = new Date();
  let from = fromRaw ? new Date(fromRaw) : null;
  let to = toRaw ? new Date(toRaw) : null;

  if (from && isNaN(from.getTime())) from = null;
  if (to && isNaN(to.getTime())) to = null;

  if (!from && !to) {
    from = new Date(now);
    from.setDate(now.getDate() - 30);
    to = new Date(now);
    to.setDate(now.getDate() + 90);
    return { from, to, clamped: false };
  }

  if (!from) {
    from = new Date(now);
    from.setDate(now.getDate() - 30);
  }
  if (!to) {
    to = new Date(from);
    to.setDate(from.getDate() + 90);
  }

  // Clamp to MAX days from `from`
  const maxToMs = from.getTime() + MAX_FEED_RANGE_DAYS * 24 * 60 * 60 * 1000;
  let clamped = false;
  if (to.getTime() > maxToMs) {
    to = new Date(maxToMs);
    clamped = true;
  }
  // Refuse inverted ranges
  if (to.getTime() < from.getTime()) {
    to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    clamped = true;
  }

  return { from, to, clamped };
}
