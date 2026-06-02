/**
 * Wave 10 W10-5A: build a signed Apple `.pkpass` for a family
 * household.
 *
 * The pass is a Generic Pass with:
 *   - Primary field: family display name ("The Paschall Family")
 *   - Secondary fields: number of children, household short code
 *   - Auxiliary fields: up to 4 children's first names (full list
 *     goes on the back of the pass)
 *   - Back fields: full child list with grades + emergency contact
 *     reminder + support link
 *   - QR barcode: household_id (consumed by future kiosk-scan flow
 *     in W10-5A-UI sub-PR)
 *   - Brand: indigo background, cream foreground, coral label
 *
 * `serialNumber` is deterministic per household — it's the
 * household_id itself. That means re-downloads REPLACE the old pass
 * in the user's wallet rather than stacking duplicates. The
 * `authenticationToken` is per-household but stable; today's pass
 * doesn't carry `webServiceURL`, so the token is dormant — leaving
 * the field in lets us turn on remote pass updates later without a
 * schema migration.
 *
 * No `webServiceURL` in v1 == no Apple-side pass-update infra.
 * Parents who want a refreshed pass re-download from the same URL;
 * the new pass replaces the old one because the serial matches.
 */

import { PKPass } from "passkit-generator";
import {
  ICON_PNG_BASE64,
  ICON_2X_PNG_BASE64,
  ICON_3X_PNG_BASE64,
  LOGO_PNG_BASE64,
  LOGO_2X_PNG_BASE64,
  STRIP_PNG_BASE64,
  STRIP_2X_PNG_BASE64,
} from "./assets";

const BG_COLOR = "rgb(45, 48, 71)"; // vc-indigo #2D3047
const FG_COLOR = "rgb(254, 252, 249)"; // vc-bg cream
const LABEL_COLOR = "rgb(224, 122, 95)"; // vc-coral

export interface FamilyPassChild {
  id: string;
  first_name: string;
  grade: string | null;
}

export interface FamilyPassInput {
  /** Stable household identifier — serves as the pass serial number. */
  household_id: string;
  /** Per-household auth token (dormant in v1; reserved for remote update). */
  auth_token: string;
  /** Display name on the primary field, e.g. "The Paschall Family". */
  family_name: string;
  /** Optional short code shown alongside the count — last 6 chars of household_id. */
  church_name: string;
  children: FamilyPassChild[];
  /** Where parents click for help (links from the back of the pass). */
  support_url: string;
}

function getCertsFromEnv() {
  // Specific per-var check so a future failure audit row can name
  // the actual culprit, not "one of these six is missing." Each
  // entry returns a status:
  //   - "missing"     → process.env.X is undefined entirely (not
  //                      added in Vercel, or wrong scope)
  //   - "empty"       → present but trims to an empty string (added
  //                      with no value, or pasted whitespace only)
  //   - "ok"          → has at least one non-whitespace character
  // The empty-vs-missing distinction matters because Vercel's
  // "Sensitive" type can occasionally show a var in the dashboard
  // that doesn't propagate to runtime, or vice versa.
  const slots = [
    ["APPLE_PASSKIT_PASS_TYPE_ID", process.env.APPLE_PASSKIT_PASS_TYPE_ID],
    ["APPLE_PASSKIT_TEAM_ID", process.env.APPLE_PASSKIT_TEAM_ID],
    ["APPLE_PASSKIT_CERT_PEM", process.env.APPLE_PASSKIT_CERT_PEM],
    ["APPLE_PASSKIT_KEY_PEM", process.env.APPLE_PASSKIT_KEY_PEM],
    ["APPLE_PASSKIT_KEY_PASSWORD", process.env.APPLE_PASSKIT_KEY_PASSWORD],
    ["APPLE_WWDR_PEM", process.env.APPLE_WWDR_PEM],
  ] as const;
  const issues = slots
    .map(([name, value]) => {
      if (value === undefined) return `${name}=missing`;
      if (value.trim().length === 0) return `${name}=empty`;
      return null;
    })
    .filter((v): v is string => v !== null);
  if (issues.length > 0) {
    throw new Error(
      `Apple PassKit env vars are not fully configured at runtime. Issues: ${issues.join(", ")}.`,
    );
  }
  // After the check above, all six slot values are non-null/non-empty
  // strings — but TS doesn't see that through the array. Re-read with
  // bang so we keep strict typing downstream.
  return {
    passTypeIdentifier: process.env.APPLE_PASSKIT_PASS_TYPE_ID!,
    teamIdentifier: process.env.APPLE_PASSKIT_TEAM_ID!,
    certs: {
      wwdr: process.env.APPLE_WWDR_PEM!,
      signerCert: process.env.APPLE_PASSKIT_CERT_PEM!,
      signerKey: process.env.APPLE_PASSKIT_KEY_PEM!,
      signerKeyPassphrase: process.env.APPLE_PASSKIT_KEY_PASSWORD!,
    },
  };
}

/**
 * The pass.json content. Exported separately so unit tests can
 * golden-file the shape without exercising the certificate signing
 * pipeline (which needs real env vars).
 *
 * Wave 10 W10-5A V2 layout — switched from `generic` to `storeCard`:
 *
 *   - `storeCard` semantically matches "family loyalty card for this
 *     church" better than `generic`, AND unlocks `stripImage` (the
 *     decorative banner between primary and secondary fields, which
 *     `generic` doesn't support).
 *
 *   - `logoText` (church name) renders next to the VolunteerCal logo
 *     in the top-left, communicating "this church's pass, powered
 *     by VolunteerCal" at-a-glance.
 *
 *   - `headerFields` (top-right) carries the short household code,
 *     freeing the secondary row.
 *
 *   - Children render as a single multi-line `secondaryFields` value
 *     (Apple's auxiliary-field row is horizontal and gets cramped
 *     past 2 children — multi-line is the only stack-vertically
 *     option). A small overflow back-field still calls out hidden
 *     children when the family is large.
 *
 *   - Back-field "Powered by VolunteerCal" makes the relationship
 *     explicit for parents who don't know the SaaS by name.
 */
export function buildPassProps(
  input: FamilyPassInput,
  passTypeIdentifier: string,
  teamIdentifier: string,
) {
  const shortCode = input.household_id.slice(-6).toUpperCase();

  const childInline = input.children
    .map((c) => `${c.first_name}${c.grade ? `  ·  ${c.grade}` : ""}`)
    .join("\n");

  const childLines = input.children
    .map((c) => `• ${c.first_name}${c.grade ? ` — ${c.grade}` : ""}`)
    .join("\n");

  return {
    formatVersion: 1 as const,
    passTypeIdentifier,
    teamIdentifier,
    serialNumber: input.household_id,
    authenticationToken: input.auth_token,
    organizationName: input.church_name,
    description: `${input.family_name} — family check-in pass`,
    backgroundColor: BG_COLOR,
    foregroundColor: FG_COLOR,
    labelColor: LABEL_COLOR,
    logoText: input.church_name,
    sharingProhibited: true,
    storeCard: {
      headerFields: [
        {
          key: "household_code",
          label: "Code",
          value: shortCode,
        },
      ],
      primaryFields: [
        {
          key: "family",
          label: "Family",
          value: input.family_name,
        },
      ],
      secondaryFields: [
        {
          key: "children_list",
          label: input.children.length === 1 ? "Child" : "Children",
          value: childInline || "Add children in your account",
        },
      ],
      auxiliaryFields: [],
      backFields: [
        {
          key: "children_full",
          label: "Children",
          value:
            childLines ||
            "No children on file yet — add them in your VolunteerCal account.",
        },
        {
          key: "kiosk_instructions",
          label: "Speed up next check-in",
          value:
            "Show this pass at the kiosk QR scanner to pull up your household instantly — no phone number needed.",
        },
        {
          key: "support",
          label: "Need help?",
          value: `Email info@volunteercal.com or visit ${input.support_url}`,
        },
        {
          key: "household_id",
          label: "Household ID",
          value: input.household_id,
        },
        {
          key: "powered_by",
          label: " ",
          value: "Powered by VolunteerCal",
        },
      ],
    },
    barcodes: [
      {
        format: "PKBarcodeFormatQR" as const,
        message: input.household_id,
        messageEncoding: "iso-8859-1",
        altText: shortCode,
      },
    ],
  };
}

/** Build and SIGN the .pkpass. Returns the binary as a Buffer. */
export async function buildFamilyPassBuffer(
  input: FamilyPassInput,
): Promise<Buffer> {
  const { passTypeIdentifier, teamIdentifier, certs } = getCertsFromEnv();
  const props = buildPassProps(input, passTypeIdentifier, teamIdentifier);

  // CRITICAL: the third constructor arg `OverridablePassProps` is
  // `Omit<PassProps, "barcodes" | "generic" | "boardingPass" | ...>`
  // — passing `generic` or `barcodes` there gets rejected at
  // runtime by Joi validation with a generic "Could not build
  // wallet pass" 500.
  //
  // The supported pattern is to put the FULL pass.json as a buffer
  // alongside the icons/logos; passkit-generator parses + validates
  // it (incl. the per-type fields and barcodes), then signs.
  // (See passkit-generator README "Buffer Model" example.)
  const pass = new PKPass(
    {
      "pass.json": Buffer.from(JSON.stringify(props), "utf8"),
      "icon.png": Buffer.from(ICON_PNG_BASE64, "base64"),
      "icon@2x.png": Buffer.from(ICON_2X_PNG_BASE64, "base64"),
      "icon@3x.png": Buffer.from(ICON_3X_PNG_BASE64, "base64"),
      "logo.png": Buffer.from(LOGO_PNG_BASE64, "base64"),
      "logo@2x.png": Buffer.from(LOGO_2X_PNG_BASE64, "base64"),
      // Wave 10 W10-5A V2: strip image (gradient banner) between
      // primary and secondary fields. Only renders because the
      // pass is `storeCard` (not `generic`, which doesn't support
      // strip images). Brand palette: vc-indigo → vc-coral diagonal
      // with a warm radial glow in the top-right.
      "strip.png": Buffer.from(STRIP_PNG_BASE64, "base64"),
      "strip@2x.png": Buffer.from(STRIP_2X_PNG_BASE64, "base64"),
    },
    certs,
  );

  return pass.getAsBuffer();
}
