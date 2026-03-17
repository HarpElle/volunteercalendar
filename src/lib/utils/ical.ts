/** iCal (.ics) feed generator for VolunteerCalendar */

interface CalendarEvent {
  uid: string;
  summary: string;
  description: string;
  dtstart: string; // ISO date string (YYYY-MM-DD)
  startTime: string; // HH:MM (24hr)
  durationMinutes: number;
  location?: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Convert ISO date + time to iCal DTSTART format: 20260322T090000 */
function toICalDateTime(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = timeStr.split(":").map(Number);
  return `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;
}

/** Convert duration in minutes to iCal DURATION format: PT1H30M */
function toICalDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  let result = "PT";
  if (h > 0) result += `${h}H`;
  if (m > 0) result += `${m}M`;
  return result || "PT0M";
}

/** Escape special characters for iCal text fields */
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Generate an iCal feed string from a list of events */
export function generateICalFeed(
  calendarName: string,
  events: CalendarEvent[],
  timezone: string = "America/New_York",
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VolunteerCalendar//EN",
    `X-WR-CALNAME:${escapeICalText(calendarName)}`,
    `X-WR-TIMEZONE:${timezone}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const event of events) {
    const dtstart = toICalDateTime(event.dtstart, event.startTime);
    const duration = toICalDuration(event.durationMinutes);
    const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}@volunteercalendar.org`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=${timezone}:${dtstart}`,
      `DURATION:${duration}`,
      `SUMMARY:${escapeICalText(event.summary)}`,
      `DESCRIPTION:${escapeICalText(event.description)}`,
    );
    if (event.location) {
      lines.push(`LOCATION:${escapeICalText(event.location)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
