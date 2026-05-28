/**
 * Deterministic check-in window math, shared by the SmartCheckInBanner
 * (client) and POST /api/check-in/self (server).
 *
 * THE BUG THIS CLOSES (Codex Wave 5 Batch E phase 3, Sev 2):
 *   The server parsed `${service_date}T${start_time}` with `new Date(...)`,
 *   which interprets a suffix-less timestamp in the RUNTIME's local zone — and
 *   on Vercel that's UTC. So it ignored the church timezone entirely and
 *   computed a window offset by the whole UTC↔church gap (e.g. 4h for
 *   America/New_York in summer). The banner used a church-tz calculation, so
 *   it would show a prompt the server then rejected with "Check-in window has
 *   closed", leaving attended:null.
 *
 * THE FIX:
 *   Convert the service's wall-clock start (date + time, interpreted in the
 *   church timezone) to an ABSOLUTE epoch-ms instant, then diff against
 *   Date.now() (also absolute). Absolute-vs-absolute is independent of where
 *   the code runs, so the banner and the endpoint always agree. Pure Intl +
 *   Date — no deps, runs identically in Node and the browser.
 */

/**
 * Offset (ms) of `timeZone` at a given absolute instant, east-of-UTC positive.
 * e.g. America/New_York in summer (EDT) returns -14_400_000 (UTC-4).
 */
export function timeZoneOffsetMs(instantMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(instantMs))) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - instantMs;
}

/**
 * Epoch ms for a wall-clock `YYYY-MM-DD` date + `HH:MM` time interpreted as
 * local time in `timeZone`.
 *
 * Single-pass offset correction: accurate everywhere except within the ~1h
 * DST-transition gap (irrelevant for a service check-in window, which is never
 * scheduled at 02:00 on a spring-forward boundary).
 */
export function zonedDateTimeToEpochMs(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = (timeStr || "00:00").split(":").map(Number);
  const utcGuess = Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, 0);
  const offset = timeZoneOffsetMs(utcGuess, timeZone);
  return utcGuess - offset;
}

/**
 * `YYYY-MM-DD` for an instant (default: now) rendered in `timeZone`. Used to
 * pick "today's" service date in the church's wall-clock day.
 */
export function dateStringInTimeZone(
  timeZone: string,
  instantMs: number = Date.now(),
): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(instantMs))) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

export interface CheckInWindow {
  /** True when now ∈ [start − windowBefore, start + windowAfter]. */
  open: boolean;
  /** now − serviceStart, in minutes (negative = before start). */
  diffMinutes: number;
}

/**
 * Is `nowMs` (default: Date.now()) inside the check-in window for a service?
 * The SINGLE source of truth for both the banner and the self-check-in route.
 */
export function checkInWindowStatus(opts: {
  serviceDate: string;
  startTime: string;
  timeZone: string;
  windowBefore: number;
  windowAfter: number;
  nowMs?: number;
}): CheckInWindow {
  const nowMs = opts.nowMs ?? Date.now();
  const serviceMs = zonedDateTimeToEpochMs(
    opts.serviceDate,
    opts.startTime || "09:00",
    opts.timeZone,
  );
  const diffMinutes = (nowMs - serviceMs) / 60_000;
  return {
    open: diffMinutes >= -opts.windowBefore && diffMinutes <= opts.windowAfter,
    diffMinutes,
  };
}
