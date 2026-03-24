import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";

/**
 * GET /api/checkin/vcard?church_id=...
 * Public endpoint — returns a downloadable vCard (.vcf) file for the church's
 * check-in SMS number so guardians can save the contact.
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json(
        { error: "Missing church_id" },
        { status: 400 },
      );
    }

    const churchSnap = await adminDb
      .collection("churches")
      .doc(churchId)
      .get();
    const churchName = churchSnap.exists
      ? (churchSnap.data()!.name as string)
      : "Children's Check-In";

    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    if (!twilioPhone) {
      return NextResponse.json(
        { error: "SMS not configured" },
        { status: 503 },
      );
    }

    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${churchName} Children's Check-In`,
      `TEL;TYPE=CELL:${twilioPhone}`,
      "END:VCARD",
    ].join("\r\n");

    return new NextResponse(vcf, {
      headers: {
        "Content-Type": "text/vcard",
        "Content-Disposition": `attachment; filename="checkin-contact.vcf"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/checkin/vcard]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
