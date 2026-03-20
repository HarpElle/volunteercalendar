import { NextResponse } from "next/server";
import { generateICalFeed } from "@/lib/utils/ical";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const type = searchParams.get("type") || "personal"; // personal | ministry | org

    if (!token) {
      return new NextResponse("Missing token", { status: 400 });
    }

    const {
      collection,
      collectionGroup,
      query,
      where,
      getDocs,
      doc,
      getDoc,
      getFirestore,
    } = await import("firebase/firestore");
    const { initializeApp, getApps, getApp } = await import("firebase/app");

    const app = getApps().length === 0
      ? initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        })
      : getApp();
    const db = getFirestore(app);

    // Look up calendar feed by secret token
    const feedQ = query(
      collectionGroup(db, "calendar_feeds"),
      where("secret_token", "==", token),
    );
    const feedSnap = await getDocs(feedQ);

    if (feedSnap.empty) {
      return new NextResponse("Feed not found", { status: 404 });
    }

    const feedDoc = feedSnap.docs[0];
    const feed = feedDoc.data();
    const churchId = feed.church_id as string;

    // Fetch church for timezone + name
    const churchSnap = await getDoc(doc(db, "churches", churchId));
    const church = churchSnap.exists() ? churchSnap.data() : null;
    const timezone = (church?.timezone as string) || "America/New_York";
    const churchName = (church?.name as string) || "Church";

    // Fetch all published assignments for this church
    const assignmentsRef = collection(db, "churches", churchId, "assignments");
    const assignSnap = await getDocs(assignmentsRef);
    let assignments = assignSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Fetch services and ministries for event details
    const [servicesSnap, ministriesSnap, volunteersSnap] = await Promise.all([
      getDocs(collection(db, "churches", churchId, "services")),
      getDocs(collection(db, "churches", churchId, "ministries")),
      getDocs(collection(db, "churches", churchId, "volunteers")),
    ]);
    const serviceMap = new Map(servicesSnap.docs.map((d) => [d.id, d.data()]));
    const ministryMap = new Map(ministriesSnap.docs.map((d) => [d.id, d.data()]));
    const volunteerMap = new Map(volunteersSnap.docs.map((d) => [d.id, d.data()]));

    // Filter based on feed type
    let calendarName = `${churchName} - Volunteer Schedule`;
    const feedType = feed.type || type;
    const targetId = feed.target_id as string;

    if (feedType === "personal") {
      assignments = assignments.filter((a) => (a as Record<string, unknown>).volunteer_id === targetId);
      const vol = volunteerMap.get(targetId);
      calendarName = `${(vol as Record<string, unknown>)?.name || "My"} Schedule - ${churchName}`;
    } else if (feedType === "ministry") {
      assignments = assignments.filter((a) => (a as Record<string, unknown>).ministry_id === targetId);
      const min = ministryMap.get(targetId);
      calendarName = `${(min as Record<string, unknown>)?.name || "Ministry"} Schedule - ${churchName}`;
    } else if (feedType === "team") {
      // All assignments for ministries the target volunteer belongs to
      const vol = volunteerMap.get(targetId);
      const volMinistries = (vol as Record<string, unknown>)?.ministry_ids as string[] || [];
      assignments = assignments.filter((a) =>
        volMinistries.includes((a as Record<string, unknown>).ministry_id as string)
      );
      calendarName = `Team Schedule - ${(vol as Record<string, unknown>)?.name || "Volunteer"} - ${churchName}`;
    }
    // "org" type returns all assignments

    // Build iCal events
    let events;

    if (feedType === "personal") {
      // Personal feed: one event per assignment
      events = assignments.map((a) => {
        const data = a as Record<string, unknown>;
        const service = serviceMap.get(data.service_id as string) as Record<string, unknown> | undefined;
        const ministry = ministryMap.get(data.ministry_id as string) as Record<string, unknown> | undefined;

        return {
          uid: a.id,
          summary: `${data.role_title} - ${service?.name || "Service"}`,
          description: [
            `Ministry: ${ministry?.name || "Unknown"}`,
            `Role: ${data.role_title}`,
            `Status: ${data.status}`,
          ].join("\\n"),
          dtstart: data.service_date as string,
          startTime: (service?.start_time as string) || "09:00",
          durationMinutes: (service?.duration_minutes as number) || 90,
        };
      });
    } else {
      // Team/ministry/org feeds: aggregate by service + date, list people by role
      const grouped = new Map<string, typeof assignments>();
      for (const a of assignments) {
        const data = a as Record<string, unknown>;
        const key = `${data.service_id}|${data.service_date}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(a);
      }

      events = [...grouped.entries()].map(([key, groupAssignments]) => {
        const [serviceId, serviceDate] = key.split("|");
        const service = serviceMap.get(serviceId) as Record<string, unknown> | undefined;

        // Group by role, sorted alphabetically
        const roleMap = new Map<string, string[]>();
        for (const a of groupAssignments) {
          const data = a as Record<string, unknown>;
          const roleTitle = (data.role_title as string) || "Unknown Role";
          const volName = ((volunteerMap.get(data.volunteer_id as string) as Record<string, unknown>)?.name as string) || "Unknown";
          if (!roleMap.has(roleTitle)) roleMap.set(roleTitle, []);
          roleMap.get(roleTitle)!.push(volName);
        }

        // Build description with roles and names
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
