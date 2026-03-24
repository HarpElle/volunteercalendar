import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";
import type { CheckInHousehold, Child, ChildGrade } from "@/lib/types";

/**
 * POST /api/admin/checkin/import/pco
 * Import children and households from a Planning Center CSV export.
 *
 * Body (JSON): { church_id, csv_text, dry_run? }
 *
 * Expected PCO CSV columns (flexible matching):
 *   First Name, Last Name, Grade, Birthdate,
 *   Child's Household Name / Family Name (used for grouping),
 *   Phone Number / Mobile Phone,
 *   Allergies, Medical Notes
 *
 * PCO exports group by household/family name rather than having explicit
 * parent first/last columns, so we group by family name + phone.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id, csv_text, dry_run } = body as {
      church_id: string;
      csv_text: string;
      dry_run?: boolean;
    };

    if (!church_id || !csv_text) {
      return NextResponse.json(
        { error: "Missing church_id or csv_text" },
        { status: 400 },
      );
    }

    const membershipSnap = await adminDb
      .doc(`memberships/${userId}_${church_id}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Only admins can import data" },
        { status: 403 },
      );
    }

    const rows = parseCSV(csv_text);
    if (rows.length < 2) {
      return NextResponse.json(
        { error: "CSV must have a header row and at least one data row" },
        { status: 400 },
      );
    }

    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const dataRows = rows.slice(1);

    const col = (names: string[]) =>
      headers.findIndex((h) => names.some((n) => h.includes(n)));

    const iFirstName = col(["first name", "first_name", "child first"]);
    const iLastName = col(["last name", "last_name", "child last"]);
    const iGrade = col(["grade", "class"]);
    const iBirthdate = col(["birthdate", "birth date", "dob", "date of birth"]);
    const iFamily = col(["household", "family", "family name", "household name"]);
    const iPhone = col(["phone", "mobile", "cell", "phone number"]);
    const iAllergies = col(["allergies", "allergy"]);
    const iMedical = col(["medical", "medical notes", "health"]);

    if (iFirstName < 0 || iLastName < 0) {
      return NextResponse.json(
        { error: "CSV must contain 'First Name' and 'Last Name' columns" },
        { status: 400 },
      );
    }

    // Group by family name + phone
    const householdMap = new Map<
      string,
      {
        guardian_name: string;
        phone: string;
        children: typeof dataRows;
      }
    >();

    const skipped: string[] = [];

    for (const row of dataRows) {
      const firstName = row[iFirstName]?.trim();
      const lastName = row[iLastName]?.trim();
      if (!firstName || !lastName) {
        skipped.push(`Row missing name: ${row.join(",")}`);
        continue;
      }

      const familyName = iFamily >= 0 ? row[iFamily]?.trim() : "";
      const phone = iPhone >= 0 ? row[iPhone]?.trim() : "";
      const normalizedPhone = phone ? normalizePhone(phone) : null;

      // PCO uses family name as the primary grouping key
      const guardianName = familyName || lastName;
      const key = normalizedPhone || guardianName.toLowerCase();

      if (!householdMap.has(key)) {
        householdMap.set(key, {
          guardian_name: guardianName,
          phone: normalizedPhone || "",
          children: [],
        });
      }
      householdMap.get(key)!.children.push(row);
    }

    if (dry_run) {
      return NextResponse.json({
        dry_run: true,
        households_to_create: householdMap.size,
        children_to_create: dataRows.length - skipped.length,
        skipped_rows: skipped.length,
        skipped_details: skipped.slice(0, 10),
      });
    }

    const churchRef = adminDb.collection("churches").doc(church_id);
    const now = new Date().toISOString();
    let householdsCreated = 0;
    let childrenCreated = 0;

    for (const [, group] of householdMap) {
      const householdId = adminDb.collection("_").doc().id;

      const household: CheckInHousehold = {
        id: householdId,
        church_id,
        primary_guardian_name: group.guardian_name,
        primary_guardian_phone: group.phone,
        qr_token: randomBytes(16).toString("hex"),
        imported_from: "pco",
        created_at: now,
        updated_at: now,
        created_by: userId,
      };

      await churchRef
        .collection("checkin_households")
        .doc(householdId)
        .set(household);
      householdsCreated++;

      for (const row of group.children) {
        const childId = adminDb.collection("_").doc().id;
        const fName = row[iFirstName]?.trim() || "";
        const lName = row[iLastName]?.trim() || "";
        const rawGrade = iGrade >= 0 ? row[iGrade]?.trim() : "";
        const grade = mapGrade(rawGrade);
        const allergies = iAllergies >= 0 ? row[iAllergies]?.trim() : "";
        const medicalNotes = iMedical >= 0 ? row[iMedical]?.trim() : "";
        const birthdate = iBirthdate >= 0 ? row[iBirthdate]?.trim() : "";

        const child: Child = {
          id: childId,
          church_id,
          household_id: householdId,
          first_name: fName,
          last_name: lName,
          date_of_birth: birthdate || undefined,
          grade: grade || undefined,
          has_alerts: !!(allergies || medicalNotes),
          allergies: allergies || undefined,
          medical_notes: medicalNotes || undefined,
          imported_from: "pco",
          is_active: true,
          created_at: now,
          updated_at: now,
        };

        await churchRef.collection("children").doc(childId).set(child);
        childrenCreated++;
      }
    }

    return NextResponse.json({
      dry_run: false,
      households_created: householdsCreated,
      children_created: childrenCreated,
      skipped_rows: skipped.length,
    });
  } catch (error) {
    console.error("[POST /api/admin/checkin/import/pco]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// --- Helpers (shared pattern with breeze route) ---

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        current.push(field);
        field = "";
      } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
        current.push(field);
        field = "";
        if (current.some((c) => c.trim())) rows.push(current);
        current = [];
        if (ch === "\r") i++;
      } else {
        field += ch;
      }
    }
  }
  current.push(field);
  if (current.some((c) => c.trim())) rows.push(current);
  return rows;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

const GRADE_MAP: Record<string, ChildGrade> = {
  nursery: "nursery", infant: "nursery",
  toddler: "toddler", toddlers: "toddler",
  "pre-k": "pre-k", prek: "pre-k", preschool: "pre-k", "pre-school": "pre-k",
  kindergarten: "kindergarten", kinder: "kindergarten", k: "kindergarten",
  "1st": "1st", "1st grade": "1st", first: "1st",
  "2nd": "2nd", "2nd grade": "2nd", second: "2nd",
  "3rd": "3rd", "3rd grade": "3rd", third: "3rd",
  "4th": "4th", "4th grade": "4th", fourth: "4th",
  "5th": "5th", "5th grade": "5th", fifth: "5th",
  "6th": "6th", "6th grade": "6th", sixth: "6th",
};

function mapGrade(raw: string): ChildGrade | undefined {
  if (!raw) return undefined;
  return GRADE_MAP[raw.toLowerCase().trim()];
}
