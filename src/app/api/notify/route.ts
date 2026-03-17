import { NextResponse } from "next/server";
import { Resend } from "resend";
import { buildConfirmationEmail } from "@/lib/utils/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { church_id, schedule_id } = body;

    if (!church_id || !schedule_id) {
      return NextResponse.json(
        { error: "Missing church_id or schedule_id" },
        { status: 400 },
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service not configured (RESEND_API_KEY missing)" },
        { status: 503 },
      );
    }

    // Fetch data from Firestore
    const { collection, getDocs, doc, getDoc, getFirestore } = await import("firebase/firestore");
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

    // Fetch church
    const churchSnap = await getDoc(doc(db, "churches", church_id));
    if (!churchSnap.exists()) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }
    const church = churchSnap.data() as Record<string, unknown>;
    const churchName = (church.name as string) || "Church";

    // Fetch all assignments for this schedule
    type DocRecord = Record<string, unknown> & { id: string };
    const assignSnap = await getDocs(collection(db, "churches", church_id, "assignments"));
    const allAssignments: DocRecord[] = assignSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as DocRecord));
    const assignments = allAssignments.filter((a) => a.schedule_id === schedule_id);

    if (assignments.length === 0) {
      return NextResponse.json({ error: "No assignments found" }, { status: 404 });
    }

    // Fetch volunteers, services, ministries
    const [volSnap, svcSnap, minSnap] = await Promise.all([
      getDocs(collection(db, "churches", church_id, "volunteers")),
      getDocs(collection(db, "churches", church_id, "services")),
      getDocs(collection(db, "churches", church_id, "ministries")),
    ]);

    const volunteerMap = new Map(
      volSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]),
    );
    const serviceMap = new Map(
      svcSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]),
    );
    const ministryMap = new Map(
      minSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]),
    );

    // Determine base URL for confirmation links
    const origin = request.headers.get("origin")
      || request.headers.get("referer")?.replace(/\/[^/]*$/, "")
      || "https://volunteercalendar.org";

    // Group assignments by volunteer to send one email per volunteer
    const byVolunteer = new Map<string, typeof assignments>();
    for (const a of assignments) {
      const volId = a.volunteer_id as string;
      if (!byVolunteer.has(volId)) byVolunteer.set(volId, []);
      byVolunteer.get(volId)!.push(a);
    }

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [volId, volAssignments] of byVolunteer) {
      const volunteer = volunteerMap.get(volId);
      if (!volunteer) {
        skipped++;
        continue;
      }

      const email = volunteer.email as string;
      if (!email) {
        skipped++;
        continue;
      }

      // For MVP, send one email per assignment (each has its own confirmation token)
      // In the future, could bundle multiple assignments into one email
      for (const assignment of volAssignments) {
        // Skip already-responded assignments
        if (assignment.responded_at) {
          skipped++;
          continue;
        }

        const service = serviceMap.get(assignment.service_id as string);
        const ministry = ministryMap.get(assignment.ministry_id as string);
        const token = assignment.confirmation_token as string;
        const confirmUrl = `${origin}/confirm/${token}`;

        const { subject, html, text } = buildConfirmationEmail({
          volunteerName: (volunteer.name as string) || "Volunteer",
          churchName,
          serviceName: (service?.name as string) || "Service",
          ministryName: (ministry?.name as string) || "Ministry",
          roleTitle: (assignment.role_title as string) || "Volunteer",
          serviceDate: assignment.service_date as string,
          startTime: (service?.start_time as string) || "",
          confirmUrl,
        });

        try {
          await resend.emails.send({
            from: `${churchName} via VolunteerCalendar <noreply@harpelle.com>`,
            to: [email],
            subject,
            html,
            text,
          });
          sent++;
        } catch (err) {
          errors.push(`Failed to email ${email}: ${(err as Error).message}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      skipped,
      total: assignments.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Notify error:", error);
    return NextResponse.json(
      { error: "Failed to send notifications" },
      { status: 500 },
    );
  }
}
