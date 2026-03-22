import type { RecurrenceRule, Reservation } from "@/lib/types";

const MAX_OCCURRENCES = 52; // safety cap for "never" end type

/**
 * Generate all occurrence dates for a recurrence rule starting from startDate.
 * Returns ISO date strings ("YYYY-MM-DD").
 */
export function generateOccurrenceDates(
  startDate: string,
  rule: RecurrenceRule,
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T00:00:00");
  const maxCount =
    rule.end_type === "count" ? (rule.count ?? MAX_OCCURRENCES) : MAX_OCCURRENCES;
  const endDate =
    rule.end_type === "until_date" && rule.end_date
      ? new Date(rule.end_date + "T23:59:59")
      : null;

  let current = new Date(start);
  let count = 0;

  while (count < maxCount) {
    if (endDate && current > endDate) break;

    if (rule.frequency === "daily") {
      dates.push(toISODate(current));
      count++;
      current.setDate(current.getDate() + (rule.interval || 1));
    } else if (
      rule.frequency === "weekly" ||
      rule.frequency === "biweekly"
    ) {
      const daysOfWeek = rule.days_of_week?.length
        ? rule.days_of_week
        : [start.getDay()];
      const weekInterval =
        rule.frequency === "biweekly" ? 2 : (rule.interval || 1);

      // Find the Monday of the current week
      const weekStart = new Date(current);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());

      for (const dow of daysOfWeek.sort((a, b) => a - b)) {
        const candidate = new Date(weekStart);
        candidate.setDate(candidate.getDate() + dow);

        if (candidate < start) continue;
        if (endDate && candidate > endDate) break;
        if (count >= maxCount) break;

        dates.push(toISODate(candidate));
        count++;
      }

      // Advance to the next target week
      current = new Date(weekStart);
      current.setDate(current.getDate() + 7 * weekInterval);
    } else if (rule.frequency === "monthly_by_date") {
      dates.push(toISODate(current));
      count++;
      current.setMonth(current.getMonth() + (rule.interval || 1));
    } else if (rule.frequency === "monthly_by_weekday") {
      const week = rule.monthly_week ?? 1;
      const weekday = rule.monthly_weekday ?? start.getDay();
      const target = getNthWeekdayOfMonth(
        current.getFullYear(),
        current.getMonth(),
        weekday,
        week,
      );

      if (target && target >= start) {
        if (endDate && target > endDate) break;
        dates.push(toISODate(target));
        count++;
      }

      current.setMonth(current.getMonth() + (rule.interval || 1));
      current.setDate(1);
    } else {
      break;
    }
  }

  return dates;
}

/**
 * Create child Reservation documents for all occurrence dates in a batched write.
 * Returns array of created reservation IDs.
 */
export async function materializeRecurringReservation(
  baseReservation: Omit<Reservation, "id" | "date" | "recurrence_index">,
  dates: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  churchId: string,
): Promise<string[]> {
  const collectionRef = db.collection(`churches/${churchId}/reservations`);
  const ids: string[] = [];
  const BATCH_LIMIT = 500;

  for (let i = 0; i < dates.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = dates.slice(i, i + BATCH_LIMIT);

    for (let j = 0; j < chunk.length; j++) {
      const docRef = collectionRef.doc();
      const index = i + j;
      batch.set(docRef, {
        ...baseReservation,
        id: docRef.id,
        date: chunk[j],
        recurrence_index: index,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      ids.push(docRef.id);
    }

    await batch.commit();
  }

  return ids;
}

/**
 * Cancel occurrences in a recurrence group.
 * scope: "all" cancels every occurrence, "from_date" cancels on/after fromDate,
 * "single" cancels just the specified reservation.
 */
export async function cancelRecurrenceGroup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  churchId: string,
  groupId: string,
  scope: "all" | "from_date" | "single",
  fromDate?: string,
  singleId?: string,
): Promise<number> {
  const now = new Date().toISOString();

  if (scope === "single" && singleId) {
    const ref = db.doc(`churches/${churchId}/reservations/${singleId}`);
    await ref.update({ status: "cancelled", updated_at: now });
    return 1;
  }

  let query = db
    .collection(`churches/${churchId}/reservations`)
    .where("recurrence_group_id", "==", groupId);

  if (scope === "from_date" && fromDate) {
    query = query.where("date", ">=", fromDate);
  }

  const snap = await query.get();
  const BATCH_LIMIT = 500;
  let cancelled = 0;

  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = snap.docs.slice(i, i + BATCH_LIMIT);
    for (const doc of chunk) {
      if (doc.data().status !== "cancelled") {
        batch.update(doc.ref, { status: "cancelled", updated_at: now });
        cancelled++;
      }
    }
    await batch.commit();
  }

  return cancelled;
}

// --- Helpers ---

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Get the Nth occurrence of a weekday in a given month.
 * week: 1-5 (5 = last), weekday: 0=Sun…6=Sat
 */
function getNthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  week: number,
): Date | null {
  if (week === 5) {
    // Last occurrence of weekday in month
    const lastDay = new Date(year, month + 1, 0);
    const diff = (lastDay.getDay() - weekday + 7) % 7;
    lastDay.setDate(lastDay.getDate() - diff);
    return lastDay;
  }

  const first = new Date(year, month, 1);
  const firstDayOfWeek = first.getDay();
  let dayOffset = (weekday - firstDayOfWeek + 7) % 7;
  dayOffset += (week - 1) * 7;
  const result = new Date(year, month, 1 + dayOffset);

  if (result.getMonth() !== month) return null;
  return result;
}
