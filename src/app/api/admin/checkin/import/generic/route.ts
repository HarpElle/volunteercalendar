import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { randomBytes } from "crypto";
import type { CheckInHousehold, Child, ChildGrade } from "@/lib/types";

/**
 * POST /api/admin/checkin/import/generic
 * Generic CSV import with user-provided column mapping.
 *
 * Body (JSON): {
 *   church_id, csv_text, dry_run?,
 *   column_map: {
 *     first_name: number;      // required — column index
 *     last_name: number;       // required
 *     guardian_name?: number;
 *     guardian_phone?: number;
 *     grade?: number;
 *     birthdate?: number;
 *     allergies?: number;
 *     medical_notes?: number;
 *   }
 * }
 *
 * Works with exports from CCB, Elvanto, FellowshipOne, Rock RMS, or any
 * platform that can export children to CSV.
 */

interface ColumnMap {
  first_name: number;
  last_name: number;
  guardian_name?: number;
  guardian_phone?: number;
  grade?: number;
  birthdate?: number;
  allergies?: number;
  medical_notes?: number;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id, csv_text, dry_run, column_map } = body as {
      church_id: string;
      csv_text: string;
      dry_run?: boolean;
      column_map: ColumnMap;
    };

    if (!church_id || !csv_text) {
      return NextResponse.json(
        { error: "Missing church_id or csv_text" },
        { status: 400 },
      );
    }

    if (
      !column_map ||
      typeof column_map.first_name !== "number" ||
      typeof column_map.last_name !== "number"
    ) {
      return NextResponse.json(
        { error: "column_map must include first_name and last_name indices" },
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

    // Skip header row
    const dataRows = rows.slice(1);

    const householdMap = new Map<
      string,
      {
        guardian_name: string;
        phone: string;
        children: string[][];
      }
    >();

    const skipped: string[] = [];

    for (const row of dataRows) {
      const firstName = row[column_map.first_name]?.trim();
      const lastName = row[column_map.last_name]?.trim();
      if (!firstName || !lastName) {
        skipped.push(`Row missing name: ${row.join(",")}`);
        continue;
      }

      const guardianName =
        column_map.guardian_name != null
          ? row[column_map.guardian_name]?.trim() || lastName
          : lastName;

      const rawPhone =
        column_map.guardian_phone != null
          ? row[column_map.guardian_phone]?.trim()
          : "";

      const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : null;
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
        imported_from: "generic",
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
        const fName = row[column_map.first_name]?.trim() || "";
        const lName = row[column_map.last_name]?.trim() || "";

        const rawGrade =
          column_map.grade != null ? row[column_map.grade]?.trim() : "";
        const grade = mapGrade(rawGrade);

        const allergies =
          column_map.allergies != null
            ? row[column_map.allergies]?.trim()
            : "";
        const medicalNotes =
          column_map.medical_notes != null
            ? row[column_map.medical_notes]?.trim()
            : "";
        const birthdate =
          column_map.birthdate != null
            ? row[column_map.birthdate]?.trim()
            : "";

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
          imported_from: "generic",
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
    console.error("[POST /api/admin/checkin/import/generic]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// --- Helpers ---

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
