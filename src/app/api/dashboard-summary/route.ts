/**
 * GET /api/dashboard-summary?church_id=...&campus_id=...
 *
 * Wave 5 Batch E step 1 — backs the /dashboard home page's full data
 * load. Previously the page parallelized 6 client Firestore reads
 * + ~120 lines of post-fetch computation; now that all moves
 * server-side and returns a single shaped response.
 *
 * Auth: requireMembership(req, churchId, "volunteer") — any active
 * member of the church can hit this; the page itself is gated to
 * org members anyway.
 *
 * Caching: response is cacheable for 60s at the edge per the Wave 5
 * Batch E design. Mutations that should re-read fresh (a new
 * assignment, a status flip) call `revalidatePath('/dashboard')`
 * after their write lands. The 60s window is short enough that
 * stale data is bounded but long enough to amortize the read cost
 * across repeat dashboard loads.
 *
 * Campus scoping: when `campus_id` is provided, all per-campus
 * counts/assignments filter to that campus. Without the param,
 * counts span the org (all campuses).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertBearerToken, requireMembership } from "@/lib/server/authz";
import { parseQuery, z } from "@/lib/server/validation";
import { getServiceMinistryIds, getAllServiceRoles } from "@/lib/utils/service-helpers";
import {
  calculateRetentionSummary,
  type RetentionSummary,
} from "@/lib/services/retention-analytics";
import { log } from "@/lib/log";
import type { Schedule, Assignment, Service, Ministry, Person } from "@/lib/types";

const QuerySchema = z.object({
  church_id: z.string().min(1),
  campus_id: z.string().optional(),
});

export interface DashboardStats {
  volunteers: number;
  ministries: number;
  services: number;
  activeSchedules: number;
  fillRate: number;
  confirmed: number;
  declined: number;
  pending: number;
  totalAssignments: number;
  topVolunteers: { name: string; count: number }[];
  unscheduledVolunteers: number;
  upcomingServices: {
    name: string;
    date: string;
    ministryColor: string;
    assigned: number;
    needed: number;
  }[];
  hasPrerequisites: boolean;
}

export interface DashboardSummary {
  stats: DashboardStats;
  retention: RetentionSummary;
}

export async function GET(req: NextRequest) {
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const query = parseQuery(req, QuerySchema);
  if (query instanceof NextResponse) return query;

  const auth = await requireMembership(req, query.church_id, "volunteer");
  if (auth instanceof NextResponse) return auth;
  void auth;

  const { church_id, campus_id } = query;

  try {
    // Only load assignments from the last 90 days; matches the legacy
    // client filter and bounds retention-analytics input size.
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const cutoffDate = ninetyDaysAgo.toISOString().split("T")[0];

    const churchRef = adminDb.collection("churches").doc(church_id);
    const peopleQ = churchRef
      .collection("people")
      .where("is_volunteer", "==", true)
      .where("status", "==", "active");
    const ministriesQ = churchRef.collection("ministries");
    const servicesQ = churchRef.collection("services");
    const schedulesQ = churchRef.collection("schedules");
    const assignmentsQ = churchRef
      .collection("assignments")
      .where("service_date", ">=", cutoffDate);

    const [
      peopleSnap,
      ministriesSnap,
      servicesSnap,
      schedulesSnap,
      assignmentsSnap,
      churchSnap,
    ] = await Promise.all([
      peopleQ.get(),
      ministriesQ.get(),
      servicesQ.get(),
      schedulesQ.get(),
      assignmentsQ.get(),
      churchRef.get(),
    ]);

    let volunteers = peopleSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as unknown as Person,
    );
    const ministries = ministriesSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as unknown as Ministry,
    );
    let services = servicesSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as unknown as Service,
    );
    const schedules = schedulesSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as unknown as Schedule,
    );
    let assignments = assignmentsSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as unknown as Assignment,
    );

    // Active-campus filtering — mirror the client filter that runs
    // when activeCampusId is set. Filters volunteers, services, and
    // (by extension) the assignments and ministries they reference.
    if (campus_id) {
      volunteers = volunteers.filter(
        (v) => !v.campus_ids?.length || v.campus_ids.includes(campus_id),
      );
      services = services.filter(
        (s) => !s.campus_id || s.campus_id === campus_id,
      );
      const allowedServiceIds = new Set(services.map((s) => s.id));
      assignments = assignments.filter(
        (a) => !a.service_id || allowedServiceIds.has(a.service_id),
      );
      // Trim ministries to the ones referenced by either a kept service
      // or a kept assignment, plus any campus-tagged ministries if that
      // ever becomes a thing. For now, keep all ministries — they're
      // displayed as a global org count today.
      void ministries;
    }

    const orgPrereqs =
      (churchSnap.data()?.org_prerequisites as unknown[] | undefined) ?? [];
    const hasPrereqs =
      orgPrereqs.length > 0 ||
      ministries.some((m) => m.prerequisites && m.prerequisites.length > 0);

    const ministryMap = new Map(ministries.map((m) => [m.id, m]));
    const serviceMap = new Map(services.map((s) => [s.id, s]));

    // Active = published or in_review or approved
    const activeScheds = schedules.filter(
      (s) =>
        s.status === "published" ||
        s.status === "in_review" ||
        s.status === "approved",
    );
    const activeSchedIds = new Set(activeScheds.map((s) => s.id));
    const activeAssignments = assignments.filter((a) =>
      activeSchedIds.has(a.schedule_id),
    );

    // Fill rate: total role slots across active schedules vs filled
    const totalSlots = activeScheds.reduce((sum, sched) => {
      const schedAssigns = assignments.filter(
        (a) => a.schedule_id === sched.id,
      );
      const serviceDates = new Set(
        schedAssigns.map((a) => `${a.service_id}:${a.service_date}`),
      );
      let slots = 0;
      for (const sd of serviceDates) {
        const serviceId = sd.split(":")[0];
        const svc = serviceMap.get(serviceId);
        if (svc) slots += svc.roles.reduce((r, role) => r + role.count, 0);
      }
      return sum + slots;
    }, 0);

    const confirmed = activeAssignments.filter(
      (a) => a.status === "confirmed",
    ).length;
    const declined = activeAssignments.filter(
      (a) => a.status === "declined",
    ).length;
    const pendingCount = activeAssignments.filter(
      (a) => a.status === "draft",
    ).length;

    // Volunteer equity — count assignments per volunteer
    const volCounts = new Map<string, number>();
    for (const a of activeAssignments) {
      const vid = a.person_id;
      if (vid) volCounts.set(vid, (volCounts.get(vid) || 0) + 1);
    }
    const topVolunteers = Array.from(volCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([vid, count]) => ({
        name: volunteers.find((v) => v.id === vid)?.name || "Unknown",
        count,
      }));

    const scheduledVolIds = new Set(
      activeAssignments.map((a) => a.person_id).filter(Boolean),
    );
    const unscheduledVolunteers = volunteers.filter(
      (v) => !scheduledVolIds.has(v.id),
    ).length;

    // Upcoming services (next 14 days)
    const today = new Date();
    const twoWeeks = new Date(today);
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    const todayStr = today.toISOString().split("T")[0];
    const twoWeeksStr = twoWeeks.toISOString().split("T")[0];

    const upcoming = activeAssignments
      .filter(
        (a) => a.service_date >= todayStr && a.service_date <= twoWeeksStr,
      )
      .reduce<
        Map<string, { serviceId: string; date: string; count: number }>
      >((acc, a) => {
        const key = `${a.service_id}:${a.service_date}`;
        if (!acc.has(key)) {
          acc.set(key, {
            serviceId: a.service_id || "",
            date: a.service_date,
            count: 0,
          });
        }
        acc.get(key)!.count++;
        return acc;
      }, new Map());

    const upcomingServices = Array.from(upcoming.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6)
      .map((u) => {
        const svc = serviceMap.get(u.serviceId);
        const svcMinistryIds = svc ? getServiceMinistryIds(svc) : [];
        const ministry =
          svcMinistryIds.length > 0 ? ministryMap.get(svcMinistryIds[0]) : null;
        const needed = svc
          ? getAllServiceRoles(svc).reduce((r, role) => r + role.count, 0)
          : 0;
        return {
          name: svc?.name || "Service",
          date: u.date,
          ministryColor: ministry?.color || "#9A9BB5",
          assigned: u.count,
          needed,
        };
      });

    const stats: DashboardStats = {
      volunteers: volunteers.length,
      ministries: ministries.length,
      services: services.length,
      activeSchedules: activeScheds.length,
      fillRate:
        totalSlots > 0
          ? Math.round((activeAssignments.length / totalSlots) * 100)
          : 0,
      confirmed,
      declined,
      pending: pendingCount,
      totalAssignments: activeAssignments.length,
      topVolunteers,
      unscheduledVolunteers,
      upcomingServices,
      hasPrerequisites: hasPrereqs,
    };

    const minList = ministries.map((m) => ({ id: m.id, name: m.name }));
    const retention = calculateRetentionSummary(volunteers, assignments, minList);

    const body: DashboardSummary = { stats, retention };

    // Per Wave 5 Batch E design: 60s edge cache. revalidatePath
    // from mutation handlers bumps fresh on demand.
    return NextResponse.json(body, {
      headers: {
        "Cache-Control":
          "private, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (err) {
    log.error("[GET /api/dashboard-summary]", { error: err, church_id });
    return NextResponse.json(
      { error: "Failed to load dashboard summary" },
      { status: 500 },
    );
  }
}
