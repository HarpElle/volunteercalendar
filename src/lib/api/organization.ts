import { auth } from "@/lib/firebase/config";

/**
 * Client helper to update org-level church fields through the admin-gated
 * PATCH /api/organization endpoint (Grok F-002). Replaces direct client
 * Firestore writes from the settings panels so every org-config change is
 * role-checked + audited server-side.
 *
 * `patch` accepts: name, slug, org_type, timezone, ccli_number,
 * ccli_attestation_at, settings (shallow-merged server-side). Throws on a
 * non-OK response so callers can surface the error in the UI.
 */
export async function patchOrganization(
  churchId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const res = await fetch("/api/organization", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ church_id: churchId, patch }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Update failed (${res.status})`);
  }
}
