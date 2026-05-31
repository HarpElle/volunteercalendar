/**
 * Storage helpers for Wave 9 P0-2 check-in photos + custody documents.
 *
 * Path convention:
 *   churches/{churchId}/checkin-photos/{kind}/{id}.{ext}
 *
 * `kind` is one of:
 *   - "authorized" — photo of an authorized-pickup contact
 *   - "blocked"    — photo of a blocked-pickup contact
 *   - "documents"  — court-order PDF for a blocked-pickup entry
 *
 * Storage rules deny ALL client reads/writes for this path
 * (`storage.rules` after the foundation PR). Reads happen exclusively
 * through `getCheckInPhotoSignedUrl()` which returns a short-TTL
 * (default 5-minute) V4 signed URL from the Admin SDK. Writes happen
 * exclusively via `uploadCheckInPhoto()` invoked by API routes that
 * have already verified admin authorization.
 *
 * The `photo_url` / `document_url` fields on PersonAuthorizedPickup
 * + BlockedPickup store the **storage path** (not a URL). Callers ask
 * the read endpoint for a fresh signed URL each time they need to
 * display the asset.
 */

import { adminStorage } from "@/lib/firebase/admin";

export const CHECKIN_PHOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const CHECKIN_PHOTO_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const CHECKIN_DOC_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const CHECKIN_DOC_ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type CheckInPhotoKind = "authorized" | "blocked" | "documents";

export const DEFAULT_SIGNED_URL_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Map a content type to a safe file extension. We don't trust the
 * client-supplied filename — the path lives forever and a misleading
 * extension would compound any future content-sniffing bug.
 */
function extForContentType(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      // Should never reach here — callers validate first.
      return "bin";
  }
}

/**
 * Construct the canonical Storage path for a check-in photo / document.
 * Pure function — no I/O. Useful for tests and for code paths that need
 * to delete by reconstructed path.
 */
export function buildCheckInPhotoPath(opts: {
  churchId: string;
  kind: CheckInPhotoKind;
  id: string;
  contentType: string;
}): string {
  const ext = extForContentType(opts.contentType);
  return `churches/${opts.churchId}/checkin-photos/${opts.kind}/${opts.id}.${ext}`;
}

/**
 * Verify that a supplied storage path belongs to the caller's church
 * AND lives under the checkin-photos prefix. Defense against
 * /api/admin/checkin/photo?path=churches/OTHER/private being used to
 * read another church's data via a hand-crafted query.
 */
export function isCheckInPhotoPathFor(path: string, churchId: string): boolean {
  return path.startsWith(`churches/${churchId}/checkin-photos/`);
}

/**
 * Upload bytes to Storage. Returns the canonical storage path that
 * callers persist on the pickup doc. Throws if the upload fails — the
 * API route layer maps that to a 500.
 */
export async function uploadCheckInPhoto(opts: {
  churchId: string;
  kind: CheckInPhotoKind;
  id: string;
  buffer: Buffer;
  contentType: string;
  uploadedBy: string;
}): Promise<{ storage_path: string }> {
  const storagePath = buildCheckInPhotoPath({
    churchId: opts.churchId,
    kind: opts.kind,
    id: opts.id,
    contentType: opts.contentType,
  });
  const bucket = adminStorage.bucket();
  const fileRef = bucket.file(storagePath);
  await fileRef.save(opts.buffer, {
    metadata: {
      contentType: opts.contentType,
      metadata: { uploadedBy: opts.uploadedBy },
    },
  });
  return { storage_path: storagePath };
}

/**
 * Generate a short-TTL V4 signed URL for reading. NEVER persist the
 * URL — generate fresh on every read. The TTL keeps a leaked URL
 * useless after a few minutes.
 */
export async function getCheckInPhotoSignedUrl(opts: {
  storagePath: string;
  ttlMs?: number;
}): Promise<{ signed_url: string; expires_at: string }> {
  const ttl = opts.ttlMs ?? DEFAULT_SIGNED_URL_TTL_MS;
  const expiresAt = Date.now() + ttl;
  const bucket = adminStorage.bucket();
  const fileRef = bucket.file(opts.storagePath);
  const [signedUrl] = await fileRef.getSignedUrl({
    action: "read",
    version: "v4",
    expires: expiresAt,
  });
  return {
    signed_url: signedUrl,
    expires_at: new Date(expiresAt).toISOString(),
  };
}

/**
 * Delete a check-in photo. Best-effort — a 404 from Storage is treated
 * as "already gone" and not surfaced as an error. The caller is
 * responsible for clearing the persisted `photo_url` / `document_url`
 * field after the delete.
 */
export async function deleteCheckInPhoto(storagePath: string): Promise<void> {
  const bucket = adminStorage.bucket();
  try {
    await bucket.file(storagePath).delete();
  } catch {
    // Best-effort — already-deleted assets shouldn't fail callers.
  }
}
