/**
 * Medical-data visibility helpers — Wave 9 P0-4 sub-PR B.
 *
 * The HIPAA-aware visibility config (`CheckInSettings.medical_visibility`)
 * gates each medical field on each surface independently. This module
 * is the single source of truth for resolving "what should we show":
 *
 *   - resolveMedicalVisibility(settings) → effective per-field config
 *     (the settings doc's value when present, otherwise the
 *     DEFAULT_MEDICAL_VISIBILITY preset).
 *   - filterSnapshotForLabel(snapshot, visibility) → snapshot with
 *     fields whose `.label === false` set to null. Label generators
 *     consume this; they pass `allergy_text` from the resulting
 *     `allergies` and ignore the rest (today's printers only print
 *     allergies; future expansion can render the other two).
 *   - getRosterFieldStates(snapshot, visibility) → per-field render
 *     plan for the kiosk roster: `value` (the actual data), `visible`
 *     (whether to show the row at all), and `requiresTap` (whether
 *     to show "tap to reveal" placeholder instead of value). The
 *     route handler returns this shape; the roster client renders it
 *     and fires the existing `kiosk.medical_data_revealed` audit on
 *     tap.
 *
 * Default preset matches today's behavior (show everything everywhere,
 * no tap-to-expand). A church that hasn't configured visibility gets
 * the same UX as before this PR.
 */

import type { CheckInSettings, CheckInSession } from "@/lib/types";

export type MedicalField = "allergies" | "medical_notes" | "medications";

export interface FieldVisibility {
  label: boolean;
  roster: boolean;
  expand_on_tap_only: boolean;
}

export type MedicalVisibility = NonNullable<
  CheckInSettings["medical_visibility"]
>;

export const DEFAULT_MEDICAL_VISIBILITY: MedicalVisibility = {
  allergies: { label: true, roster: true, expand_on_tap_only: false },
  medical_notes: { label: true, roster: true, expand_on_tap_only: false },
  medications: { label: true, roster: true, expand_on_tap_only: false },
};

/**
 * Resolve the effective per-field visibility config from a settings
 * doc. Returns the configured value when present, otherwise the
 * default preset. Pass `null` / `undefined` when the settings doc
 * doesn't exist for a fresh org.
 */
export function resolveMedicalVisibility(
  settings: Pick<CheckInSettings, "medical_visibility"> | null | undefined,
): MedicalVisibility {
  return settings?.medical_visibility ?? DEFAULT_MEDICAL_VISIBILITY;
}

/**
 * Apply label-surface visibility to a snapshot. Fields whose
 * `label === false` are nulled out; the resulting snapshot is what
 * the printer adapter sees. The legacy `allergy_text` LabelJob field
 * is fed from the resulting `allergies`.
 */
export function filterSnapshotForLabel(
  snapshot: NonNullable<CheckInSession["medical_snapshot"]>,
  visibility: MedicalVisibility,
): NonNullable<CheckInSession["medical_snapshot"]> {
  return {
    allergies: visibility.allergies.label ? snapshot.allergies : null,
    medical_notes: visibility.medical_notes.label
      ? snapshot.medical_notes
      : null,
    medications: visibility.medications.label ? snapshot.medications : null,
  };
}

export interface RosterFieldState {
  field: MedicalField;
  /** Actual value, or null when omitted at the source. */
  value: string | null;
  /** Whether the field should render at all on the roster. */
  visible: boolean;
  /** When true, render a tap-to-reveal placeholder instead of value
   *  until the operator taps. */
  requires_tap: boolean;
}

/**
 * Per-field render plan for the kiosk roster. Returns one entry per
 * field, in stable order. The route handler returns this; the client
 * renders each entry per its visible/requires_tap flags and fires
 * `kiosk.medical_data_revealed` on tap.
 *
 * `requires_tap` is only set when the field is otherwise visible —
 * a field that's `roster: false` is `visible: false` and the tap
 * affordance is moot.
 */
export function getRosterFieldStates(
  snapshot: NonNullable<CheckInSession["medical_snapshot"]>,
  visibility: MedicalVisibility,
): RosterFieldState[] {
  const fields: MedicalField[] = ["allergies", "medical_notes", "medications"];
  return fields.map((field) => {
    const conf = visibility[field];
    const value = snapshot[field];
    return {
      field,
      value,
      visible: conf.roster && value !== null,
      requires_tap: conf.roster && value !== null && conf.expand_on_tap_only,
    };
  });
}

/**
 * Convenience: returns `true` when the snapshot contains at least
 * one value that's visible (after gating) without tap-to-expand.
 * Used by the roster header to decide whether to render the alert
 * indicator strip.
 */
export function snapshotHasVisibleAlert(
  snapshot: NonNullable<CheckInSession["medical_snapshot"]>,
  visibility: MedicalVisibility,
): boolean {
  return getRosterFieldStates(snapshot, visibility).some(
    (s) => s.visible && !s.requires_tap,
  );
}
