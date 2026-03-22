import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/admin/checkin/report?church_id=...&type=...&date=...&from=...&to=...
 *
 * Report types:
 *   daily       — All sessions for a given date
 *   attendance  — Attendance counts over a date range
 *   room        — Per-room attendance for a date
 *   child       — Check-in history for a specific child (&child_id=...)
 *   alerts      — Security alerts over a date range
 *   first_time  — First-time visitors over a date range
 *
 * Supports &format=csv for CSV export.
 */
export async function GET(req: NextRequest) {
  try {
    const churchId = req.nextUrl.searchParams.get("church_id");
    const reportType = req.nextUrl.searchParams.get("type") || "daily";
    const date = req.nextUrl.searchParams.get("date");
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const childId = req.nextUrl.searchParams.get("child_id");
    const format = req.nextUrl.searchParams.get("format");

    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const membershipSnap = await adminDb
      .doc(`memberships/${userId}_${churchId}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    switch (reportType) {
      case "daily": {
        const targetDate = date || new Date().toISOString().split("T")[0];
        const sessionsSnap = await churchRef
          .collection("checkInSessions")
          .where("service_date", "==", targetDate)
          .get();

        const sessions = await enrichSessions(churchRef, sessionsSnap.docs);

        if (format === "csv") {
          return csvResponse(
            ["Child", "Room", "Checked In", "Checked Out", "Security Code", "Alerts"],
            sessions.map((s) => [
              s.child_name,
              s.room_name,
              s.checked_in_at,
              s.checked_out_at || "",
              s.security_code,
              s.alert_snapshot || "",
            ]),
            `checkin-daily-${targetDate}.csv`,
          );
        }
        return NextResponse.json({ date: targetDate, sessions });
      }

      case "attendance": {
        if (!from || !to) {
          return NextResponse.json(
            { error: "Attendance report requires from and to dates" },
            { status: 400 },
          );
        }
        const sessionsSnap = await churchRef
          .collection("checkInSessions")
          .where("service_date", ">=", from)
          .where("service_date", "<=", to)
          .get();

        // Group by date
        const byDate: Record<string, number> = {};
        for (const doc of sessionsSnap.docs) {
          const d = doc.data().service_date;
          byDate[d] = (byDate[d] || 0) + 1;
        }

        const rows = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
        if (format === "csv") {
          return csvResponse(
            ["Date", "Count"],
            rows.map(([d, c]) => [d, String(c)]),
            `checkin-attendance-${from}-to-${to}.csv`,
          );
        }
        return NextResponse.json({
          from,
          to,
          total: sessionsSnap.size,
          by_date: byDate,
        });
      }

      case "room": {
        const targetDate = date || new Date().toISOString().split("T")[0];
        const sessionsSnap = await churchRef
          .collection("checkInSessions")
          .where("service_date", "==", targetDate)
          .get();

        const byRoom: Record<string, { name: string; count: number; checked_out: number }> = {};
        for (const doc of sessionsSnap.docs) {
          const data = doc.data();
          const rid = data.room_id || "unassigned";
          if (!byRoom[rid]) {
            byRoom[rid] = { name: data.room_name || "Unassigned", count: 0, checked_out: 0 };
          }
          byRoom[rid].count++;
          if (data.checked_out_at) byRoom[rid].checked_out++;
        }

        if (format === "csv") {
          return csvResponse(
            ["Room", "Total", "Still Checked In", "Checked Out"],
            Object.values(byRoom).map((r) => [
              r.name,
              String(r.count),
              String(r.count - r.checked_out),
              String(r.checked_out),
            ]),
            `checkin-rooms-${targetDate}.csv`,
          );
        }
        return NextResponse.json({ date: targetDate, rooms: byRoom });
      }

      case "child": {
        if (!childId) {
          return NextResponse.json(
            { error: "Child report requires child_id" },
            { status: 400 },
          );
        }
        let query = churchRef
          .collection("checkInSessions")
          .where("child_id", "==", childId);
        if (from) query = query.where("service_date", ">=", from);
        if (to) query = query.where("service_date", "<=", to);

        const sessionsSnap = await query.get();
        const sessions = sessionsSnap.docs.map((doc) => doc.data());

        if (format === "csv") {
          return csvResponse(
            ["Date", "Room", "Checked In", "Checked Out"],
            sessions.map((s) => [
              s.service_date,
              s.room_name,
              s.checked_in_at,
              s.checked_out_at || "",
            ]),
            `checkin-child-${childId}.csv`,
          );
        }
        return NextResponse.json({ child_id: childId, sessions });
      }

      case "alerts": {
        const targetFrom = from || new Date().toISOString().split("T")[0];
        const targetTo = to || targetFrom;

        const alertsSnap = await churchRef
          .collection("checkinAlerts")
          .where("occurred_at", ">=", targetFrom)
          .where("occurred_at", "<=", targetTo + "T23:59:59.999Z")
          .get();

        const alerts = alertsSnap.docs.map((doc) => doc.data());
        return NextResponse.json({ from: targetFrom, to: targetTo, alerts });
      }

      case "first_time": {
        if (!from || !to) {
          return NextResponse.json(
            { error: "First-time report requires from and to dates" },
            { status: 400 },
          );
        }

        const householdsSnap = await churchRef
          .collection("checkin_households")
          .where("created_at", ">=", from)
          .where("created_at", "<=", to + "T23:59:59.999Z")
          .get();

        const households = householdsSnap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: d.id,
            primary_guardian_name: d.primary_guardian_name,
            created_at: d.created_at,
            imported_from: d.imported_from,
          };
        });

        if (format === "csv") {
          return csvResponse(
            ["Guardian Name", "Registration Date", "Source"],
            households.map((h) => [
              h.primary_guardian_name,
              h.created_at,
              h.imported_from || "manual",
            ]),
            `checkin-first-time-${from}-to-${to}.csv`,
          );
        }
        return NextResponse.json({ from, to, households });
      }

      default:
        return NextResponse.json(
          { error: `Unknown report type: ${reportType}` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("[GET /api/admin/checkin/report]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// --- Helpers ---

async function enrichSessions(
  churchRef: FirebaseFirestore.DocumentReference,
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
) {
  const results: {
    id: string;
    child_name: string;
    room_name: string;
    checked_in_at: string;
    checked_out_at: string | null;
    security_code: string;
    alert_snapshot: string | null;
  }[] = [];

  for (const doc of docs) {
    const data = doc.data();
    let childName = "Unknown";

    const childSnap = await churchRef
      .collection("children")
      .doc(data.child_id)
      .get();
    if (childSnap.exists) {
      const c = childSnap.data()!;
      childName = `${c.preferred_name || c.first_name} ${c.last_name}`;
    }

    results.push({
      id: data.id,
      child_name: childName,
      room_name: data.room_name,
      checked_in_at: data.checked_in_at,
      checked_out_at: data.checked_out_at || null,
      security_code: data.security_code,
      alert_snapshot: data.alert_snapshot || null,
    });
  }

  return results;
}

function csvResponse(headers: string[], rows: string[][], filename: string) {
  const escape = (s: string) =>
    s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;

  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(",")),
  ];

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
