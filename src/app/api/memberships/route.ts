import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertBearerToken, requireMembership } from "@/lib/server/authz";
import { parseQuery, z } from "@/lib/server/validation";
import { log } from "@/lib/log";

const QuerySchema = z.object({
  church_id: z.string().min(1),
});

/**
 * GET /api/memberships?church_id=xxx
 * Fetch all memberships for a church. Uses Admin SDK to bypass Firestore
 * security-rule limitations on collection-level queries.
 * Requires Bearer token from an active scheduler/admin/owner of the church.
 */
export async function GET(req: NextRequest) {
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const query = parseQuery(req, QuerySchema);
  if (query instanceof NextResponse) return query;

  const auth = await requireMembership(req, query.church_id, "scheduler");
  if (auth instanceof NextResponse) return auth;
  void auth;

  try {
    // Fetch all memberships for this church
    const snap = await adminDb
      .collection("memberships")
      .where("church_id", "==", query.church_id)
      .get();

    const memberships: Record<string, unknown>[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Enrich with user display data (Admin SDK bypasses self-read-only rule)
    const uniqueUserIds = [...new Set(
      memberships.map((m) => m.user_id as string).filter(Boolean),
    )];
    const userDocs = await Promise.all(
      uniqueUserIds.map((uid) => adminDb.collection("users").doc(uid).get()),
    );
    const userMap = new Map<string, { display_name: string; email: string }>();
    for (const udoc of userDocs) {
      if (udoc.exists) {
        const d = udoc.data()!;
        userMap.set(udoc.id, {
          display_name: (d.display_name as string) || "",
          email: (d.email as string) || "",
        });
      }
    }
    for (const mem of memberships) {
      const userData = userMap.get(mem.user_id as string);
      if (userData) {
        mem._user_display_name = userData.display_name;
        mem._user_email = userData.email;
      }
    }

    return NextResponse.json(memberships);
  } catch (err) {
    log.error("GET /api/memberships failed", { error: err, church_id: query.church_id });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
