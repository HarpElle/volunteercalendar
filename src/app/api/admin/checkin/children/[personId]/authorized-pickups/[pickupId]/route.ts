/**
 * Hypothesis test: empty route at [personId]/authorized-pickups/[pickupId]
 * to isolate whether the path pattern itself causes the production hang.
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true });
}
