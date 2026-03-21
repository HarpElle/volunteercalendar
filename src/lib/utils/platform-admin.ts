/**
 * Returns true if the given Firebase UID is a platform superadmin.
 * Reads from PLATFORM_ADMIN_UIDS env var (comma-separated UIDs).
 */
export function isPlatformAdmin(uid: string): boolean {
  const adminUids = (process.env.PLATFORM_ADMIN_UIDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return adminUids.includes(uid);
}
