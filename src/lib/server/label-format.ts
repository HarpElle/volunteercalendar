/**
 * Wave 10 W10-R: label-content formatting for the printed child
 * sticker.
 *
 * Why this exists: full-name labels are a stranger-risk surface.
 * A child's printed name + visible alert badge is enough for an
 * adversary at a distance to call the child by name, fake
 * familiarity, and approach. See docs/research/sticker-privacy.md
 * for the cited research synthesis.
 *
 * The default ("first_name_last_initial") preserves visual
 * verification utility for staff ("which Sarah?" → "Sarah J.")
 * while limiting public disclosure. Churches that want the legacy
 * full-name behavior can opt in via Settings → Check-In.
 */

export type LabelContentFormat =
  | "first_name_last_initial"
  | "first_name"
  | "first_and_last";

export const DEFAULT_LABEL_CONTENT_FORMAT: LabelContentFormat =
  "first_name_last_initial";

export const LABEL_CONTENT_FORMAT_OPTIONS: ReadonlyArray<LabelContentFormat> = [
  "first_name_last_initial",
  "first_name",
  "first_and_last",
];

/**
 * Render the child's name for the printed sticker per the org's
 * `label_content_format` setting.
 *
 * `firstNameOrDisplay` is the preferred name when set, otherwise the
 * legal first name — same precedence the kiosk uses everywhere else.
 *
 * Falls back to `"first_name_last_initial"` when `format` is
 * undefined/null/empty/unknown.
 */
export function formatLabelName(
  firstNameOrDisplay: string,
  lastName: string,
  format?: LabelContentFormat | null | string,
): string {
  const first = (firstNameOrDisplay ?? "").trim();
  const last = (lastName ?? "").trim();
  const effective: LabelContentFormat =
    format === "first_name" ||
    format === "first_and_last" ||
    format === "first_name_last_initial"
      ? format
      : DEFAULT_LABEL_CONTENT_FORMAT;

  switch (effective) {
    case "first_name":
      return first || last;
    case "first_and_last":
      return `${first} ${last}`.trim();
    case "first_name_last_initial":
    default: {
      if (!first) return last;
      if (!last) return first;
      // Skip the period when the initial is non-alphanumeric (some
      // names start with a hyphen or apostrophe). Falls back to just
      // the first name if we can't pull a real initial.
      const initial = last[0];
      const wantsPeriod = /[A-Za-z]/.test(initial);
      return wantsPeriod ? `${first} ${initial.toUpperCase()}.` : first;
    }
  }
}
