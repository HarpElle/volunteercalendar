import { NextResponse } from "next/server";
import type { DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://ergunkodesh.org",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function nextOccurrence(dayOfWeek: number, fromDate: Date): Date {
  const result = new Date(fromDate);
  result.setHours(0, 0, 0, 0);
  const diff = (dayOfWeek - result.getDay() + 7) % 7;
  result.setDate(result.getDate() + diff);
  return result;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Missing token" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Look up calendar feed by secret token — same pattern as /api/calendar
    const churchesSnap = await adminDb.collection("churches").get();
    let feed: DocumentData | null = null;
    let churchId = "";

    for (const churchDoc of churchesSnap.docs) {
      const feedSnap = await adminDb
        .collection("churches")
        .doc(churchDoc.id)
        .collection("calendar_feeds")
        .where("secret_token", "==", token)
        .limit(1)
        .get();
      if (!feedSnap.empty) {
        feed = feedSnap.docs[0].data();
        churchId = churchDoc.id;
        break;
      }
    }

    if (!feed) {
      return NextResponse.json(
        { error: "Invalid token" },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    const feedType = (feed.type as string) || "org";
    const targetId = feed.target_id as string;

    // Fetch church for timezone
    const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
    const church = churchSnap.exists ? churchSnap.data() : null;
    const timezone = (church?.timezone as string) || "America/New_York";

    // Fetch all supporting data in parallel
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
    const personMap = new Map(peopleSnap.docs.map((d) => [d.id, d.data()]));

    // Resolve the target date
    let resolvedDate = searchParams.get("date") ?? "";

    if (!resolvedDate) {
      // Find next upcoming service date using church timezone
      const now = new Date(
        new Date().toLocaleString("en-US", { timeZone: timezone }),
      );
      const candidates: Date[] = [];
      for (const svcDoc of servicesSnap.docs) {
        const svc = svcDoc.data();
        const dow = svc.day_of_week as number;
        if (typeof dow === "number") {
          candidates.push(nextOccurrence(dow, now));
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.getTime() - b.getTime());
        resolvedDate = toISODate(candidates[0]);
      }
    }

    // Filter assignments to the resolved date, excluding declined
    let assignments = assignSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>)
      .filter(
        (a) =>
          a.service_date === resolvedDate &&
          a.status !== "declined",
      );

    // Apply feed-type scoping
    if (feedType === "personal") {
      assignments = assignments.filter((a) => a.person_id === targetId);
    } else if (feedType === "ministry") {
      assignments = assignments.filter((a) => a.ministry_id === targetId);
    } else if (feedType === "team") {
      const vol = personMap.get(targetId);
      const volMinistries = (vol?.ministry_ids as string[]) || [];
      assignments = assignments.filter((a) =>
        volMinistries.includes(a.ministry_id as string),
      );
    }
    // "org" returns all — no filter

    // Determine service name from the first assignment's service_id
    let serviceName = "Service";
    if (assignments.length > 0) {
      const firstServiceId = assignments[0].service_id as string | null;
      if (firstServiceId) {
        const svc = serviceMap.get(firstServiceId);
        if (svc?.name) serviceName = svc.name as string;
      }
    } else if (resolvedDate) {
      // Try to infer from the day of the resolved date
      const dow = new Date(resolvedDate + "T12:00:00").getDay();
      for (const svcDoc of servicesSnap.docs) {
        const svc = svcDoc.data();
        if (svc.day_of_week === dow) {
          serviceName = (svc.name as string) || "Service";
          break;
        }
      }
    }

    const volunteers = assignments.map((a) => {
      const person = personMap.get(a.person_id as string);
      const ministry = ministryMap.get(a.ministry_id as string);
      return {
        id: a.person_id as string,
        name: (person?.name as string) || "Unknown",
        role: (a.role_title as string) || "Unknown Role",
        team: (ministry?.name as string) || "General",
      };
    });

    return NextResponse.json(
      { date: resolvedDate, serviceName, volunteers },
      { status: 200, headers: { ...CORS_HEADERS, "Cache-Control": "no-cache, no-store, must-revalidate" } },
    );
  } catch (error) {
    console.error("Volunteers API error:", error);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
