/**
 * Wave 11 Org Branding Sub-PR A.
 *
 * POST /api/admin/org/branding/logo (multipart form-data)
 *   - field `file`: PNG / JPG / SVG, ≤2MB, dimensions ≥256×256 (validated server-side)
 *   - field `church_id`: target org
 *   - Body shape: standard multipart. Use req.formData() in Next 16 App Router.
 *   - Auth: Bearer JWT + admin/owner role
 *   - On success: uploads to `churches/{churchId}/branding/logo-{ts}.{ext}` in
 *     Firebase Storage, deletes the previous logo object (if any), updates the
 *     church doc's `logo_url` field, emits `org.brand_logo_updated` audit.
 *   - Returns: { logo_url, size_bytes, mime }
 *
 * DELETE /api/admin/org/branding/logo?church_id=X
 *   - Auth: Bearer JWT + admin/owner role
 *   - Deletes the storage object + nulls logo_url
 *   - Emits `org.brand_logo_removed` audit
 *   - Returns: { success: true }
 *
 * Notes / known-gotchas:
 *   - Requires Firebase Storage enabled on the project AND the
 *     NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET env var to be set in Vercel.
 *     If either is missing, the bucket().file() call throws — we catch it
 *     and surface a clear "Storage not configured" error.
 *   - Sharp validates the image bytes server-side. A malicious upload that
 *     LOOKS like a PNG but has invalid pixel data gets rejected before
 *     storage.
 *   - SVG validation is best-effort — sharp won't parse SVG by default;
 *     we accept it as text + check it starts with `<svg` and has no
 *     `<script>` tags. (Inline SVG can have script tags that execute when
 *     rendered as `<img src>` in some contexts. Better safe.)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb, adminStorage } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { audit, userActor } from "@/lib/server/audit";
import { log } from "@/lib/log";
import sharp from "sharp";

// Hard limits enforced server-side. Client may show friendlier messages.
const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const MIN_DIMENSION = 256;
const ALLOWED_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
]);

interface UidOrResponse {
  uid?: string;
  response?: NextResponse;
}

async function authUid(req: NextRequest): Promise<UidOrResponse> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    return { uid: decoded.uid };
  } catch {
    return {
      response: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
    };
  }
}

/**
 * Check that the caller is admin/owner on the church via the
 * membership doc convention used elsewhere in the codebase.
 */
async function requireOrgAdminRole(
  uid: string,
  churchId: string,
): Promise<NextResponse | null> {
  const memSnap = await adminDb
    .doc(`memberships/${uid}_${churchId}`)
    .get();
  if (!memSnap.exists) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const role = (memSnap.data()?.role as string) || "";
  if (role !== "admin" && role !== "owner") {
    return NextResponse.json(
      { error: "Only church admins or owners can manage branding" },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Resolve the Storage bucket. Throws a clear error if Storage isn't
 * provisioned or the bucket env var is missing.
 */
function getBrandingBucket() {
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error(
      "Firebase Storage bucket not configured. Set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET in Vercel + enable Storage in Firebase Console.",
    );
  }
  return adminStorage.bucket(bucketName);
}

/**
 * Strip a tampered upload to its actual format. For raster images we re-encode
 * via sharp, which throws on malformed bytes (catches "PNG with embedded XSS"
 * type tricks). For SVG we do a text-level sanity check.
 *
 * Returns the *clean* bytes + a canonical extension to use in the storage path.
 */
async function validateAndCanonicalize(
  bytes: Buffer,
  mime: string,
): Promise<{ clean: Buffer; ext: "png" | "jpg" | "svg" }> {
  if (mime === "image/svg+xml") {
    const text = bytes.toString("utf8");
    if (!text.trim().toLowerCase().startsWith("<svg")) {
      throw new Error("Invalid SVG file");
    }
    if (/<script[\s>]/i.test(text)) {
      throw new Error("SVG files may not contain <script> tags");
    }
    return { clean: bytes, ext: "svg" };
  }
  // Whitelist mime BEFORE invoking sharp so the right error surfaces for
  // unsupported formats (sharp throws its own less-specific message).
  if (mime !== "image/png" && mime !== "image/jpeg") {
    throw new Error(`Unsupported mime: ${mime}`);
  }
  // PNG or JPEG: round-trip through sharp; reject if malformed; enforce
  // minimum dimensions; re-encode to canonical format.
  const img = sharp(bytes);
  const meta = await img.metadata();
  if (!meta.width || !meta.height) {
    throw new Error("Could not read image dimensions");
  }
  if (meta.width < MIN_DIMENSION || meta.height < MIN_DIMENSION) {
    throw new Error(
      `Image must be at least ${MIN_DIMENSION}×${MIN_DIMENSION} pixels (got ${meta.width}×${meta.height})`,
    );
  }
  if (mime === "image/png") {
    const clean = await img.png().toBuffer();
    return { clean, ext: "png" };
  }
  if (mime === "image/jpeg") {
    const clean = await img.jpeg({ quality: 90 }).toBuffer();
    return { clean, ext: "jpg" };
  }
  throw new Error(`Unsupported mime: ${mime}`);
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 6, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const { uid, response } = await authUid(req);
    if (response || !uid) return response!;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Expected multipart/form-data body" },
        { status: 400 },
      );
    }

    const churchId = (form.get("church_id") as string | null)?.trim() ?? "";
    const file = form.get("file");
    if (!churchId) {
      return NextResponse.json({ error: "church_id is required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `File is ${Math.round(file.size / 1024)}KB; max is ${Math.round(MAX_BYTES / 1024)}KB`,
        },
        { status: 413 },
      );
    }
    if (!ALLOWED_MIMES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported format ${file.type}. Use PNG, JPEG, or SVG.` },
        { status: 415 },
      );
    }

    const roleErr = await requireOrgAdminRole(uid, churchId);
    if (roleErr) return roleErr;

    const rawBytes = Buffer.from(await file.arrayBuffer());

    let clean: Buffer;
    let ext: "png" | "jpg" | "svg";
    try {
      ({ clean, ext } = await validateAndCanonicalize(rawBytes, file.type));
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid image" },
        { status: 422 },
      );
    }

    let bucket;
    try {
      bucket = getBrandingBucket();
    } catch (err) {
      log.error("[POST /api/admin/org/branding/logo] storage init", err);
      return NextResponse.json(
        {
          error:
            "Firebase Storage isn't configured for this project. Ask the project admin to enable Storage in the Firebase Console and set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.",
        },
        { status: 503 },
      );
    }

    // Read existing logo path before write — we'll delete it after the
    // new upload succeeds so a failure mid-way doesn't blow away the
    // current branding.
    const churchRef = adminDb.collection("churches").doc(churchId);
    const churchSnap = await churchRef.get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }
    const previousLogoUrl =
      (churchSnap.data()?.logo_url as string | null | undefined) ?? null;

    const ts = Math.floor(Date.now() / 1000);
    const objectPath = `churches/${churchId}/branding/logo-${ts}.${ext}`;
    const newObject = bucket.file(objectPath);
    await newObject.save(clean, {
      contentType: file.type,
      metadata: {
        cacheControl: "public, max-age=3600",
        metadata: {
          uploaded_by_uid: uid,
          uploaded_at: new Date().toISOString(),
          church_id: churchId,
        },
      },
    });
    // Make publicly readable so <img src=> works without signed URLs.
    // Bucket-level rules also need to permit public read for this path;
    // the deployed storage.rules covers that.
    await newObject.makePublic();
    const newLogoUrl = `https://storage.googleapis.com/${bucket.name}/${objectPath}`;

    await churchRef.update({ logo_url: newLogoUrl });

    // Best-effort delete of the previous logo. Failures here don't break
    // the upload — worst case we leave an orphan object.
    if (previousLogoUrl) {
      try {
        const prevPath = extractObjectPath(previousLogoUrl, bucket.name);
        if (prevPath && prevPath !== objectPath) {
          await bucket.file(prevPath).delete({ ignoreNotFound: true });
        }
      } catch (err) {
        log.warn("[POST /api/admin/org/branding/logo] orphan cleanup", err);
      }
    }

    void audit({
      church_id: churchId,
      actor: userActor(uid),
      action: "org.brand_logo_updated",
      target_type: "church",
      target_id: churchId,
      metadata: {
        size_bytes: clean.length,
        mime: file.type,
        previous_logo_present: previousLogoUrl !== null,
      },
      outcome: "ok",
    });

    return NextResponse.json({
      logo_url: newLogoUrl,
      size_bytes: clean.length,
      mime: file.type,
    });
  } catch (error) {
    log.error("[POST /api/admin/org/branding/logo]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const limited = rateLimit(req, { limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const { uid, response } = await authUid(req);
    if (response || !uid) return response!;

    const churchId =
      req.nextUrl.searchParams.get("church_id")?.trim() ?? "";
    if (!churchId) {
      return NextResponse.json({ error: "church_id is required" }, { status: 400 });
    }

    const roleErr = await requireOrgAdminRole(uid, churchId);
    if (roleErr) return roleErr;

    const churchRef = adminDb.collection("churches").doc(churchId);
    const churchSnap = await churchRef.get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }
    const previousLogoUrl =
      (churchSnap.data()?.logo_url as string | null | undefined) ?? null;

    // Null the field first — even if the bucket delete fails, the
    // surfaces immediately fall back to the VolunteerCal mark.
    await churchRef.update({ logo_url: null });

    if (previousLogoUrl) {
      try {
        const bucket = getBrandingBucket();
        const prevPath = extractObjectPath(previousLogoUrl, bucket.name);
        if (prevPath) {
          await bucket.file(prevPath).delete({ ignoreNotFound: true });
        }
      } catch (err) {
        log.warn("[DELETE /api/admin/org/branding/logo] cleanup", err);
      }
    }

    void audit({
      church_id: churchId,
      actor: userActor(uid),
      action: "org.brand_logo_removed",
      target_type: "church",
      target_id: churchId,
      metadata: { had_logo: previousLogoUrl !== null },
      outcome: "ok",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("[DELETE /api/admin/org/branding/logo]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * From a public-storage URL like
 *   https://storage.googleapis.com/<bucket>/churches/.../logo-123.png
 * extract the bucket-relative object path. Returns null if the URL
 * doesn't match the expected bucket (defensive — protects against
 * deleting objects from arbitrary URLs persisted in the field).
 */
function extractObjectPath(url: string, bucketName: string): string | null {
  const prefix = `https://storage.googleapis.com/${bucketName}/`;
  if (!url.startsWith(prefix)) return null;
  return url.slice(prefix.length);
}
