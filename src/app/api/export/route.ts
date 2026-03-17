import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase/config";
import { collection, getDocs } from "firebase/firestore";

type DocRecord = Record<string, unknown> & { id: string };

function getAll(churchId: string, col: string): Promise<DocRecord[]> {
  return getDocs(collection(db, "churches", churchId, col)).then((snap) =>
    snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DocRecord)
  );
}

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function formatDateReadable(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const churchId = searchParams.get("church_id");
  const scheduleId = searchParams.get("schedule_id");
  const format = searchParams.get("format") || "csv";

  if (!churchId || !scheduleId) {
    return NextResponse.json(
      { error: "church_id and schedule_id are required" },
      { status: 400 }
    );
  }

  try {
    const [assignments, volunteers, services, ministries] = await Promise.all([
      getAll(churchId, "assignments"),
      getAll(churchId, "volunteers"),
      getAll(churchId, "services"),
      getAll(churchId, "ministries"),
    ]);

    const schedAssignments = assignments.filter(
      (a) => (a.schedule_id as string) === scheduleId
    );

    const volMap = new Map(volunteers.map((v) => [v.id, v]));
    const svcMap = new Map(services.map((s) => [s.id, s]));
    const minMap = new Map(ministries.map((m) => [m.id, m]));

    // Sort by date, then service, then ministry
    schedAssignments.sort((a, b) => {
      const dateCompare = (a.service_date as string).localeCompare(
        b.service_date as string
      );
      if (dateCompare !== 0) return dateCompare;
      const svcA = svcMap.get(a.service_id as string);
      const svcB = svcMap.get(b.service_id as string);
      const svcCompare = ((svcA?.name as string) || "").localeCompare(
        (svcB?.name as string) || ""
      );
      if (svcCompare !== 0) return svcCompare;
      return ((a.role_title as string) || "").localeCompare(
        (b.role_title as string) || ""
      );
    });

    if (format === "csv") {
      const headers = [
        "Date",
        "Service",
        "Start Time",
        "Ministry",
        "Role",
        "Volunteer",
        "Email",
        "Status",
      ];
      const rows = schedAssignments.map((a) => {
        const vol = volMap.get(a.volunteer_id as string);
        const svc = svcMap.get(a.service_id as string);
        const min = minMap.get(a.ministry_id as string);
        return [
          formatDateReadable(a.service_date as string),
          (svc?.name as string) || "",
          (svc?.start_time as string) || "",
          (min?.name as string) || "",
          (a.role_title as string) || "",
          (vol?.name as string) || "",
          (vol?.email as string) || "",
          (a.status as string) || "draft",
        ].map(escapeCSV);
      });

      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join(
        "\n"
      );

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="schedule-${scheduleId.slice(0, 8)}.csv"`,
        },
      });
    }

    // JSON format (for print/PDF rendering)
    const data = schedAssignments.map((a) => {
      const vol = volMap.get(a.volunteer_id as string);
      const svc = svcMap.get(a.service_id as string);
      const min = minMap.get(a.ministry_id as string);
      return {
        date: a.service_date as string,
        dateFormatted: formatDateReadable(a.service_date as string),
        service: (svc?.name as string) || "",
        startTime: (svc?.start_time as string) || "",
        ministry: (min?.name as string) || "",
        ministryColor: (min?.color as string) || "#9A9BB5",
        role: (a.role_title as string) || "",
        volunteer: (vol?.name as string) || "",
        email: (vol?.email as string) || "",
        status: (a.status as string) || "draft",
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json(
      { error: "Failed to export schedule" },
      { status: 500 }
    );
  }
}
