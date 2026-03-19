import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { getAdapter } from "@/lib/integrations";
import type { IntegrationProvider, ImportResult } from "@/lib/integrations/types";

/**
 * POST /api/import
 *
 * Actions:
 * - { action: "test" }       — Test connection with provided credentials
 * - { action: "import" }     — Run full import (people + teams)
 * - { action: "save_creds" } — Store encrypted credentials for the church
 *
 * All actions require auth (Bearer token) and admin+ role.
 */
export async function POST(req: NextRequest) {
  // Verify auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const body = await req.json();
  const { action, provider, credentials, church_id } = body as {
    action: string;
    provider: IntegrationProvider;
    credentials: Record<string, string>;
    church_id: string;
  };

  if (!action || !provider || !church_id) {
    return NextResponse.json(
      { error: "Missing required fields: action, provider, church_id" },
      { status: 400 },
    );
  }

  // Verify user is admin+ for this church
  const membershipId = `${uid}_${church_id}`;
  const memberSnap = await adminDb.doc(`memberships/${membershipId}`).get();
  if (!memberSnap.exists) {
    return NextResponse.json({ error: "Not a member of this church" }, { status: 403 });
  }
  const memberData = memberSnap.data();
  const role = memberData?.role as string;
  if (!["admin", "owner"].includes(role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const adapter = getAdapter(provider);
  if (!adapter) {
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  }

  try {
    // --- Test Connection ---
    if (action === "test") {
      if (!credentials) {
        return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
      }
      const ok = await adapter.testConnection(credentials);
      return NextResponse.json({ connected: ok });
    }

    // --- Save Credentials ---
    if (action === "save_creds") {
      if (!credentials) {
        return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
      }
      await adminDb
        .doc(`churches/${church_id}/integrations/${provider}`)
        .set({
          provider,
          values: credentials,
          connected_at: new Date().toISOString(),
          connected_by: uid,
        });
      return NextResponse.json({ saved: true });
    }

    // --- Preview (fetch teams + people count without writing) ---
    if (action === "preview") {
      let creds = credentials;
      if (!creds) {
        const storedSnap = await adminDb
          .doc(`churches/${church_id}/integrations/${provider}`)
          .get();
        if (!storedSnap.exists) {
          return NextResponse.json(
            { error: "No stored credentials. Connect the integration first." },
            { status: 400 },
          );
        }
        creds = storedSnap.data()?.values as Record<string, string>;
      }

      const [people, teams] = await Promise.all([
        adapter.fetchPeople(creds),
        adapter.fetchTeams(creds),
      ]);

      // Map member counts per team
      const teamSummaries = teams.map((t) => ({
        id: t.external_id,
        name: t.name,
        member_count: t.member_ids.length,
      }));

      return NextResponse.json({
        total_people: people.length,
        teams: teamSummaries,
      });
    }

    // --- Import to Queue (write to invite_queue for review instead of volunteers) ---
    if (action === "import_to_queue") {
      const { team_ids } = body as { team_ids?: string[] };

      let creds = credentials;
      if (!creds) {
        const storedSnap = await adminDb
          .doc(`churches/${church_id}/integrations/${provider}`)
          .get();
        if (!storedSnap.exists) {
          return NextResponse.json(
            { error: "No stored credentials. Connect the integration first." },
            { status: 400 },
          );
        }
        creds = storedSnap.data()?.values as Record<string, string>;
      }

      const [people, teams] = await Promise.all([
        adapter.fetchPeople(creds),
        adapter.fetchTeams(creds),
      ]);

      // Filter by selected teams if provided
      const selectedTeams = team_ids?.length
        ? teams.filter((t) => team_ids.includes(t.external_id))
        : teams;

      // Build set of member IDs from selected teams
      const selectedMemberIds = new Set<string>();
      for (const team of selectedTeams) {
        for (const mid of team.member_ids) {
          selectedMemberIds.add(mid);
        }
      }

      // Filter people to only those in selected teams (if filtering)
      const filteredPeople = team_ids?.length
        ? people.filter((p) => selectedMemberIds.has(p.external_id))
        : people;

      // Map teams to people's groups
      for (const team of selectedTeams) {
        for (const memberId of team.member_ids) {
          const person = filteredPeople.find((p) => p.external_id === memberId);
          if (person && !person.groups.includes(team.name)) {
            person.groups.push(team.name);
          }
        }
      }

      // Look up existing ministries to map team names → ministry IDs
      const ministriesSnap = await adminDb
        .collection(`churches/${church_id}/ministries`)
        .get();
      const ministryNameMap = new Map<string, string>();
      for (const d of ministriesSnap.docs) {
        ministryNameMap.set(d.data().name?.toLowerCase(), d.id);
      }

      // Write to invite_queue
      let batch = adminDb.batch();
      let queued = 0;
      let batchCount = 0;
      const now = new Date().toISOString();

      for (const person of filteredPeople) {
        if (!person.email) continue;

        const ministryIds = person.groups
          .map((g) => ministryNameMap.get(g.toLowerCase()))
          .filter((id): id is string => !!id);

        const queueRef = adminDb
          .collection(`churches/${church_id}/invite_queue`)
          .doc();
        batch.set(queueRef, {
          church_id,
          name: person.name,
          email: person.email,
          phone: person.phone || null,
          role: "volunteer",
          ministry_ids: ministryIds,
          source: "chms",
          source_provider: provider,
          status: "pending_review",
          volunteer_id: null,
          error_message: null,
          reviewed_by: null,
          reviewed_at: null,
          sent_at: null,
          created_at: now,
        });
        queued++;
        batchCount++;
        if (batchCount >= 490) {
          await batch.commit();
          batch = adminDb.batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      return NextResponse.json({
        queued,
        teams_selected: selectedTeams.length,
        total_people: people.length,
      });
    }

    // --- Import (direct to volunteers — legacy) ---
    if (action === "import") {
      // Use provided credentials or load stored ones
      let creds = credentials;
      if (!creds) {
        const storedSnap = await adminDb
          .doc(`churches/${church_id}/integrations/${provider}`)
          .get();
        if (!storedSnap.exists) {
          return NextResponse.json(
            { error: "No stored credentials. Connect the integration first." },
            { status: 400 },
          );
        }
        creds = storedSnap.data()?.values as Record<string, string>;
      }

      // Fetch data from the ChMS
      const [people, teams] = await Promise.all([
        adapter.fetchPeople(creds),
        adapter.fetchTeams(creds),
      ]);

      // Map teams to people's groups
      for (const team of teams) {
        for (const memberId of team.member_ids) {
          const person = people.find((p) => p.external_id === memberId);
          if (person && !person.groups.includes(team.name)) {
            person.groups.push(team.name);
          }
        }
      }

      // Write imported people as volunteers into the church's subcollection
      const batch = adminDb.batch();
      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const person of people) {
        try {
          // Check if volunteer with this email already exists
          const existing = await adminDb
            .collection(`churches/${church_id}/volunteers`)
            .where("email", "==", person.email)
            .limit(1)
            .get();

          if (!existing.empty) {
            // Update existing volunteer with external data
            const docRef = existing.docs[0].ref;
            batch.update(docRef, {
              phone: person.phone || existing.docs[0].data().phone || null,
              imported_from: provider === "planning_center" ? "planning_center" : provider === "breeze" ? "breeze" : "rock",
            });
          } else {
            // Create new volunteer
            const volRef = adminDb
              .collection(`churches/${church_id}/volunteers`)
              .doc();
            batch.set(volRef, {
              church_id,
              name: person.name,
              email: person.email,
              phone: person.phone,
              user_id: null,
              membership_id: null,
              status: "active",
              ministry_ids: [],
              role_ids: [],
              household_id: null,
              availability: {
                blockout_dates: [],
                recurring_unavailable: [],
                preferred_frequency: 2,
                max_roles_per_month: 8,
              },
              reminder_preferences: { channels: ["email"] },
              stats: {
                times_scheduled_last_90d: 0,
                last_served_date: null,
                decline_count: 0,
                no_show_count: 0,
              },
              imported_from: provider === "planning_center" ? "planning_center" : provider === "breeze" ? "breeze" : "rock",
              created_at: new Date().toISOString(),
            });
          }
          imported++;
        } catch (err) {
          errors.push(`Failed to import ${person.name}: ${err}`);
          skipped++;
        }
      }

      // Commit batch (Firestore limit: 500 operations per batch)
      // For large imports, we'd need to split into multiple batches
      if (imported > 0) {
        await batch.commit();
      }

      const result: ImportResult = {
        provider,
        people,
        teams,
        skipped,
        errors,
        imported_at: new Date().toISOString(),
      };

      // Store import log
      await adminDb
        .collection(`churches/${church_id}/import_logs`)
        .add({
          provider,
          people_count: people.length,
          teams_count: teams.length,
          imported: imported,
          skipped,
          errors: errors.slice(0, 20), // Cap stored errors
          imported_by: uid,
          imported_at: result.imported_at,
        });

      return NextResponse.json({
        imported,
        skipped,
        teams_found: teams.length,
        people_found: people.length,
        errors: errors.slice(0, 5),
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("POST /api/import error:", err);
    return NextResponse.json({ error: "Import failed. Check your credentials and try again." }, { status: 500 });
  }
}
