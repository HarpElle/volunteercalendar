import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { generateICalFeed } from "@/lib/utils/ical";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return new NextResponse("Missing token", { status: 400 });
    }

    // Look up calendar feed by secret token across all churches
    const feedSnap = await adminDb
      .collectionGroup("calendar_feeds")
      .where("secret_token", "==", token)
      .limit(1)
      .get();

    if (feedSnap.empty) {
      return new NextResponse("Feed not found", { status: 404 });
    }

    const feed = feedSnap.docs[0].data();
    const churchId = feed.church_id as string;
    const feedType = (feed.type as string) || "personal";
    const targetId = feed.target_id as string;

    // Fetch church for timezone + name
    const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
    const church = churchSnap.exists ? churchSnap.data() : null;
    const timezone = (church?.timezone as string) || "America/New_York";
    const churchName = (church?.name as string) || "Church";

    // Fetch assignments and supporting data in parallel
    const [assignSnap, servicesSnap, ministriesSnap, peopleSnap] =
      await Promise.all([
        adminDb
          .collection("churches")
          .doc(churchId)
          .collection("assignments")
          .get(),
        adminDb
          .collection("churches")
          .doc(churchId)
          .collection("services")
          .get(),
        adminDb
          .collection("churches")
          .doc(churchId)
          .collection("ministries")
          .get(),
        adminDb
          .collection("churches")
          .doc(churchId)
          .collection("people")
          .get(),
      ]);

    const serviceMap = new Map(
      servicesSnap.docs.map((d) => [d.id, d.data()]),
    );
    const ministryMap = new Map(
      ministriesSnap.docs.map((d) => [d.id, d.data()]),
    );
    const volunteerMap = new Map(
      peopleSnap.docs.map((d) => [d.id, d.data()]),
    );
    let assignments = assignSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Record<string, unknown>[];

    // Filter assignments and build calendar name based on feed type
    let calendarName = `${churchName} - Volunteer Schedule`;

    if (feedType === "personal") {
      assignments = assignments.filter((a) => a.person_id === targetId);
      const vol = volunteerMap.get(targetId);
      calendarName = `${(vol?.name as string) || "My"} Schedule - ${churchName}`;
    } else if (feedType === "ministry") {
      assignments = assignments.filter((a) => a.ministry_id === targetId);
      const min = ministryMap.get(targetId);
      calendarName = `${(min?.name as string) || "Ministry"} Schedule - ${churchName}`;
    } else if (feedType === "team") {
      const vol = volunteerMap.get(targetId);
      const volMinistries = (vol?.ministry_ids as string[]) || [];
      assignments = assignments.filter((a) =>
        volMinistries.includes(a.ministry_id as string),
      );
      calendarName = `Team Schedule - ${(vol?.name as string) || "Volunteer"} - ${churchName}`;
    }
    // "org" type returns all assignments — no filter needed

    // Build iCal events
    let events;

    if (feedType === "personal") {
      events = assignments.map((a) => {
        const service = serviceMap.get(a.service_id as string);
        const ministry = ministryMap.get(a.ministry_id as string);
        return {
          uid: a.id as string,
          summary: `${a.role_title} - ${(service?.name as string) || "Service"}`,
          description: [
            `Ministry: ${(ministry?.name as string) || "Unknown"}`,
            `Role: ${a.role_title}`,
            `Status: ${a.status}`,
          ].join("\\n"),
          dtstart: a.service_date as string,
          startTime: (service?.start_time as string) || "09:00",
          durationMinutes: (service?.duration_minutes as number) || 90,
        };
      });
    } else {
      // Team / ministry / org feeds: aggregate by service + date
      const grouped = new Map<string, typeof assignments>();
      for (const a of assignments) {
        const key = `${a.service_id}|${a.service_date}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(a);
      }

      events = [...grouped.entries()].map(([key, groupAssignments]) => {
        const [serviceId, serviceDate] = key.split("|");
        const service = serviceMap.get(serviceId);

        const roleMap = new Map<string, string[]>();
        for (const a of groupAssignments) {
          const roleTitle = (a.role_title as string) || "Unknown Role";
          const volName =
            (volunteerMap.get(a.person_id as string)?.name as string) ||
            "Unknown";
          if (!roleMap.has(roleTitle)) roleMap.set(roleTitle, []);
          roleMap.get(roleTitle)!.push(volName);
        }

        const descLines = [...roleMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([role, names]) => `${role}: ${names.sort().join(", ")}`);

        return {
          uid: `${serviceId}_${serviceDate}`,
          summary: (service?.name as string) || "Service",
          description: descLines.join("\\n"),
          dtstart: serviceDate,
          startTime: (service?.start_time as string) || "09:00",
          durationMinutes: (service?.duration_minutes as number) || 90,
        };
      });
    }

    const ical = generateICalFeed(calendarName, events, timezone);

    return new NextResponse(ical, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${calendarName.replace(/[^a-zA-Z0-9]/g, "_")}.ics"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Calendar feed error:", error);
    return new NextResponse("Server error", { status: 500 });
  }
}
