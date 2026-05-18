/**
 * Date display helpers for calendar-date strings (YYYY-MM-DD).
 *
 * Why these exist:
 *   `new Date("2026-05-24")` parses as UTC midnight. In US local timezones
 *   (UTC-4 through UTC-8), `.toLocaleDateString()` then renders the previous
 *   day. Service plan dates, schedule dates, etc. are calendar dates — not
 *   timestamps — so this UTC-vs-local drift is always wrong for our domain.
 *
 *   `formatLocalDate(iso, opts)` anchors the string to noon local time, which
 *   sits safely inside the same calendar day for every US timezone.
 *
 * Use this helper anywhere a YYYY-MM-DD string needs to render to a user.
 */

/** Format a YYYY-MM-DD string as a calendar date in the user's locale. */
export function formatLocalDate(
  iso: string | undefined | null,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!iso) return "";
  // Strip any time portion already on the string — we always want to anchor
  // at local-noon to avoid TZ drift.
  const datePart = iso.split("T")[0];
  const d = new Date(`${datePart}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, options);
}

/** Long calendar-date format. e.g. "Sunday, May 24, 2026". */
export function formatLocalDateLong(iso: string | undefined | null): string {
  return formatLocalDate(iso, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Short calendar-date format. e.g. "Sun, May 24". */
export function formatLocalDateShort(iso: string | undefined | null): string {
  return formatLocalDate(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Today's calendar date in the given IANA timezone as a YYYY-MM-DD string.
 *
 * Why this exists:
 *   Lots of places use `new Date().toISOString().split("T")[0]` to derive
 *   "today" — but `toISOString()` is UTC. After ~7pm local time on the
 *   US west / central coast, the UTC date rolls to tomorrow and queries
 *   for "today" silently miss every same-day reservation, check-in, etc.
 *
 *   Pass the church's `timezone` field (e.g. "America/Chicago") to compute
 *   the calendar date the user actually sees. Falls back to UTC if the
 *   timezone is invalid (no exception thrown).
 *
 *   Works in both Node (server) and browser (client) — `Intl.DateTimeFormat`
 *   is universally available.
 */
export function todayInTimezone(timezone: string | undefined | null): string {
  const tz = timezone || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === "year")?.value || "0000";
    const month = parts.find((p) => p.type === "month")?.value || "01";
    const day = parts.find((p) => p.type === "day")?.value || "01";
    return `${year}-${month}-${day}`;
  } catch {
    // Invalid timezone — fall back to UTC. Better wrong than crashed.
    return new Date().toISOString().split("T")[0];
  }
}
