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
import { log } from "@/lib/log";
import {
  ICON_PNG_BASE64,
  ICON_2X_PNG_BASE64,
  ICON_3X_PNG_BASE64,
  LOGO_PNG_BASE64,
  LOGO_2X_PNG_BASE64,
  STRIP_PNG_BASE64,
  STRIP_2X_PNG_BASE64,
} from "./assets";

// W10-5A V4 palette — cream surface + indigo text + coral labels
// per Codex spec. Coral labels are tiny and uppercase; the contrast
// against cream is acceptable AND the type hierarchy (size +
// spacing) doesn't rely on color alone — Jason's colorblind-safe.
const BG_COLOR = "rgb(254, 252, 249)"; // vc-bg cream #FEFCF9
const FG_COLOR = "rgb(45, 48, 71)"; // vc-indigo #2D3047 (main text)
const LABEL_COLOR = "rgb(224, 122, 95)"; // vc-coral #E07A5F (small uppercase labels)

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
  /**
   * Display name on the pass front. Inbound values usually include the
   * leading "The " article ("The Paschall Family"); the builder strips
   * it so the pass reads as "Paschall Family" per Codex spec.
   */
  family_name: string;
  /** Church/org name shown next to the VolunteerCal mark at the top. */
  church_name: string;
  children: FamilyPassChild[];
  /** Where parents click for help (linked from the back of the pass). */
  support_url: string;
  /**
   * Optional: church/campus coordinates. When provided, the pass
   * surfaces on the lock screen when the user is within ~100m of the
   * church (Apple's default). Empty/undefined skips location relevancy.
   * Forward-compat for a future Church.coordinates field — V4 ships
   * without persisting these but plumbs them through.
   */
  locations?: Array<{
    latitude: number;
    longitude: number;
    relevant_text?: string;
  }>;
  /**
   * Optional: ISO timestamp when the pass becomes relevant on the
   * lock screen (e.g. the next service start time). Forward-compat for
   * a future per-service hookup; V4 ships without computing it.
   */
  relevant_date?: string;
  /**
   * Wave 11 Org Branding Sub-PR B: public URL of the church's
   * uploaded logo. When present, the wallet pass renders this in
   * place of the embedded VolunteerCal CheckInBadge for both the
   * icon set (29/58/87) and the logo slot (60×50 / 120×100). On
   * any fetch / decode failure we silently fall back to the badge
   * so a transient Storage outage doesn't break pass generation.
   */
  church_logo_url?: string | null;
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
 * Wave 10 W10-5A V4 — addresses the Codex-led design review of V3:
 *
 *   - Brings back the strip image (V3 dropped it thinking
 *     Starbucks/ChargePoint don't use them; they DO — the strip IS
 *     their visual identity). V4's strip is an editorial cream/sand
 *     wash with soft coral + sage organic shapes. Brand-aligned,
 *     no literal subject matter.
 *
 *   - Strips the "The " prefix from the family name. "Paschall
 *     Family" on the front; "The Paschall Family" rendering felt
 *     stilted and burned horizontal space.
 *
 *   - Children render as ONE FIELD PER CHILD (not one multi-line
 *     value). Apple's secondary fields render side-by-side, so
 *     "4TH / Ellianna   6TH / Harper" both appear on the front
 *     without the V3 truncation issue.
 *
 *   - For 5+ children: first 3 visible + "+N more" overflow slot;
 *     full list on the back.
 *
 *   - Description switched from "The Paschall Family — family
 *     check-in pass" (the AI-ish em-dash voice) to "Paschall
 *     Family Check-In" — what shows as the pass title in Pass
 *     Details.
 *
 *   - Front-of-pass labels restored where they add semantic clarity
 *     ("FAMILY", "CODE", per-child grade). Coral label color is fine
 *     here because labels are small uppercase + type hierarchy +
 *     spacing carry the design, not color alone (Jason's colorblind-
 *     safe).
 *
 *   - Back copy shortened per Codex (no em dashes, no long marketing
 *     prose). Kiosk instructions one sentence; help line ~15 words.
 *
 *   - Forward-compat for `locations` (church campus coordinates) +
 *     `relevantDate` (next service start time). Both ship as
 *     pass-through fields V4 doesn't populate but won't break when
 *     a future Church.coordinates / service-time hookup arrives.
 *
 *   - Pass stays `storeCard` — semantically right + supports strip.
 */
export function buildPassProps(
  input: FamilyPassInput,
  passTypeIdentifier: string,
  teamIdentifier: string,
) {
  const shortCode = input.household_id.slice(-6).toUpperCase();

  // Strip leading "The " from the household name so "Paschall Family"
  // renders cleanly. Leaves other articles ("Los Mendoza Family")
  // alone; Codex spec only called out "The".
  const cleanFamilyName = input.family_name.replace(/^The\s+/i, "");

  // Per-child front-of-pass field. Apple secondary fields render
  // side-by-side as label-above-value pairs, which is exactly the
  // shape we want: grade as the small label, first name as the
  // value. 1-3 children fit comfortably across the secondary row;
  // overflow handled below.
  const MAX_VISIBLE = 3;
  const visible = input.children.slice(0, MAX_VISIBLE);
  const overflowCount = input.children.length - visible.length;
  const childFields = visible.map((c, i) => ({
    key: `child_${i}`,
    label: (c.grade ?? "").toString().toUpperCase(),
    value: c.first_name,
  }));
  if (overflowCount > 0) {
    childFields.push({
      key: "child_more",
      label: "ALSO",
      value: `+${overflowCount} more`,
    });
  }

  // Empty-state placeholder (single field) — keeps the secondary row
  // from collapsing when a family hasn't added kids yet.
  const secondaryFields =
    childFields.length > 0
      ? childFields
      : [
          {
            key: "children_empty",
            label: "CHILDREN",
            value: "Add in your account",
          },
        ];

  // Back-of-pass child list — bulleted, normal hyphens (no em dashes
  // per Codex). Falls back to a short friendly message when empty.
  const childLinesBack = input.children
    .map((c) => `${c.first_name}${c.grade ? ` - ${c.grade}` : ""}`)
    .join("\n");

  // Apple PassKit `locations` shape: array of {latitude, longitude,
  // relevantText?}. Forward-compat: pass through if provided.
  const locations = (input.locations ?? []).map((loc) => ({
    latitude: loc.latitude,
    longitude: loc.longitude,
    ...(loc.relevant_text ? { relevantText: loc.relevant_text } : {}),
  }));

  return {
    formatVersion: 1 as const,
    passTypeIdentifier,
    teamIdentifier,
    serialNumber: input.household_id,
    authenticationToken: input.auth_token,
    organizationName: input.church_name,
    description: `${cleanFamilyName} Check-In`,
    backgroundColor: BG_COLOR,
    foregroundColor: FG_COLOR,
    labelColor: LABEL_COLOR,
    logoText: input.church_name,
    sharingProhibited: true,
    ...(locations.length > 0 ? { locations } : {}),
    ...(input.relevant_date ? { relevantDate: input.relevant_date } : {}),
    storeCard: {
      // V5: headerFields intentionally empty. V4 had the household
      // code here (top-right), but it squeezed the church name in
      // logoText and forced truncation to "Anchor Fall...". The code
      // is already shown beneath the QR via `barcodes[].altText`, so
      // duplicating it in the header was just visual noise. Dropping
      // headerFields gives logoText the full top-row width.
      headerFields: [],
      primaryFields: [
        {
          key: "family",
          label: "FAMILY",
          value: cleanFamilyName,
        },
      ],
      secondaryFields,
      auxiliaryFields: [],
      backFields: [
        {
          key: "children_full",
          label: "Children",
          value:
            childLinesBack ||
            "No children on file yet. Add them in your VolunteerCal account.",
        },
        {
          key: "how_to_use",
          label: "How to use",
          value:
            "Scan this pass at the check-in kiosk to find your household.",
        },
        {
          key: "help",
          label: "Help",
          value:
            "Need help? Ask a check-in volunteer or visit volunteercal.com/help.",
        },
        {
          key: "powered_by",
          label: "",
          value: "Powered by VolunteerCal",
        },
      ],
    },
    // NOTE: Apple Wallet hard-fixes barcode rendering to black-on-
    // white for scanner reliability. There is no `foregroundColor`-
    // equivalent for the barcode in PassKit. So the QR will always
    // render in pure black regardless of the pass's `foregroundColor`
    // (the indigo brand color). The altText below the QR DOES respect
    // foregroundColor and renders in indigo.
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

/**
 * Wave 11 Sub-PR B: fetch + sharp-resize the church logo into the
 * PassKit icon + logo dimensions. Returns null on any failure
 * (network, malformed image, etc.) so the caller can fall back to
 * the embedded CheckInBadge bytes.
 *
 * Each output is `fit: 'inside'` on a transparent background so a
 * landscape wordmark uploaded by the church doesn't get squished —
 * it sits centered with transparent padding above/below. Square
 * logos fill the canvas.
 */
async function fetchAndResizeChurchLogo(url: string): Promise<{
  icon: Buffer;
  icon2x: Buffer;
  icon3x: Buffer;
  logo: Buffer;
  logo2x: Buffer;
} | null> {
  // Dynamic import keeps sharp out of the cold-start path of every
  // wallet-pass build; only loaded when a church has uploaded a logo.
  // (sharp is heavy; saving the import on the no-logo path matters.)
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      log.warn(
        "[wallet-pass] church logo fetch non-OK; using fallback",
        { url, status: res.status },
      );
      return null;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    const { default: sharp } = await import("sharp");

    const renderAt = (size: number) =>
      sharp(bytes)
        .resize(size, size, {
          fit: "inside",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    const renderRect = (w: number, h: number) =>
      sharp(bytes)
        .resize(w, h, {
          fit: "inside",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();

    const [icon, icon2x, icon3x, logo, logo2x] = await Promise.all([
      renderAt(29),
      renderAt(58),
      renderAt(87),
      renderRect(60, 50),
      renderRect(120, 100),
    ]);
    return { icon, icon2x, icon3x, logo, logo2x };
  } catch (err) {
    log.warn(
      "[wallet-pass] church logo fetch/decode failed; using fallback",
      { url, error: err instanceof Error ? err.message : String(err) },
    );
    return null;
  }
}

/** Build and SIGN the .pkpass. Returns the binary as a Buffer. */
export async function buildFamilyPassBuffer(
  input: FamilyPassInput,
): Promise<Buffer> {
  const { passTypeIdentifier, teamIdentifier, certs } = getCertsFromEnv();
  const props = buildPassProps(input, passTypeIdentifier, teamIdentifier);

  // W11 Sub-PR B: try the church's uploaded logo first; fall back
  // to the embedded VolunteerCal CheckInBadge if none / on failure.
  const churchLogo = input.church_logo_url
    ? await fetchAndResizeChurchLogo(input.church_logo_url)
    : null;

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
      "icon.png": churchLogo?.icon ?? Buffer.from(ICON_PNG_BASE64, "base64"),
      "icon@2x.png":
        churchLogo?.icon2x ?? Buffer.from(ICON_2X_PNG_BASE64, "base64"),
      "icon@3x.png":
        churchLogo?.icon3x ?? Buffer.from(ICON_3X_PNG_BASE64, "base64"),
      "logo.png": churchLogo?.logo ?? Buffer.from(LOGO_PNG_BASE64, "base64"),
      "logo@2x.png":
        churchLogo?.logo2x ?? Buffer.from(LOGO_2X_PNG_BASE64, "base64"),
      // V4 strip — cream/sand wash with soft coral + sage organic
      // shapes. Renders between primary and secondary fields. Only
      // valid on storeCard / coupon / eventTicket (generic doesn't
      // support strips). Strip is brand-neutral so it stays put
      // regardless of whether the church has a custom logo.
      "strip.png": Buffer.from(STRIP_PNG_BASE64, "base64"),
      "strip@2x.png": Buffer.from(STRIP_2X_PNG_BASE64, "base64"),
    },
    certs,
  );

  return pass.getAsBuffer();
}
