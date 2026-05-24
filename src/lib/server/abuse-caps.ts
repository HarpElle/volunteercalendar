/**
 * Pass G Phase 5: anti-multiplication + abuse-cap configuration.
 *
 * Single source of truth for "how many orgs can one human create" and
 * related limits. Plus a beta-tester whitelist so Jason + Codex + early
 * pilot orgs aren't blocked by their own anti-abuse work.
 *
 * Adjust the cap constants as launch data comes in. The whitelist is
 * env-var-driven so it can be changed without a redeploy (just update
 * the env var in Vercel and trigger a rebuild — but actually env vars
 * load on each cold start so any new function invocation picks them up).
 */

/**
 * Maximum number of Free-tier orgs a single email/user can own. Paid
 * tiers don't count toward this — once you upgrade an org, your
 * remaining Free budget is unchanged. Default 2 (from Pass G plan
 * decision #5, confirmed by Jason).
 */
export const FREE_ORG_CAP_PER_EMAIL = 2;

/**
 * Maximum number of new orgs (any tier) created from a single IP per
 * 24-hour window. Catches IP-rotating scripted creation but allows
 * legitimate cases (e.g. consultant onboarding multiple clients from
 * their office).
 */
export const ORG_CREATION_PER_IP_PER_DAY = 3;

/**
 * Returns true if the caller is on the beta-tester whitelist and
 * therefore exempt from anti-multiplication caps. Reads
 * BETA_TESTER_UIDS env var (comma-separated Firebase UIDs).
 *
 * Use case: Jason + Codex + early pilot org owners who need to spin
 * up multiple test orgs without running into the Free cap.
 */
export function isBetaTester(userId: string): boolean {
  const list = (process.env.BETA_TESTER_UIDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(userId);
}

/**
 * Same as isBetaTester but for email-based whitelist (useful when we
 * need to exempt a user before they've signed up — e.g. coordinating
 * a pilot org for someone whose UID we don't yet know).
 */
export function isBetaTesterEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.BETA_TESTER_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
