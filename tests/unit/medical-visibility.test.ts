/**
 * Wave 9 P0-4 sub-PR B — unit coverage for the medical-visibility
 * helpers. The helpers are pure; this covers default-fallback,
 * label gating, roster gating, and the tap-to-expand state.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_MEDICAL_VISIBILITY,
  resolveMedicalVisibility,
  filterSnapshotForLabel,
  getRosterFieldStates,
  snapshotHasVisibleAlert,
  type MedicalVisibility,
} from "@/lib/server/medical-visibility";
import type { CheckInSession } from "@/lib/types";

type Snapshot = NonNullable<CheckInSession["medical_snapshot"]>;

const FULL_SNAPSHOT: Snapshot = {
  allergies: "peanuts (severe), shellfish",
  medical_notes: "asthma — inhaler in backpack",
  medications: "albuterol PRN",
};

const ALLERGY_ONLY: Snapshot = {
  allergies: "peanuts",
  medical_notes: null,
  medications: null,
};

const STRICT_VISIBILITY: MedicalVisibility = {
  allergies: { label: true, roster: true, expand_on_tap_only: false },
  medical_notes: { label: false, roster: true, expand_on_tap_only: true },
  medications: { label: false, roster: false, expand_on_tap_only: false },
};

describe("resolveMedicalVisibility", () => {
  it("returns DEFAULT when settings is null", () => {
    expect(resolveMedicalVisibility(null)).toEqual(DEFAULT_MEDICAL_VISIBILITY);
  });
  it("returns DEFAULT when settings is undefined", () => {
    expect(resolveMedicalVisibility(undefined)).toEqual(
      DEFAULT_MEDICAL_VISIBILITY,
    );
  });
  it("returns DEFAULT when settings has no medical_visibility", () => {
    expect(resolveMedicalVisibility({ medical_visibility: undefined })).toEqual(
      DEFAULT_MEDICAL_VISIBILITY,
    );
  });
  it("returns the configured value when present", () => {
    expect(
      resolveMedicalVisibility({ medical_visibility: STRICT_VISIBILITY }),
    ).toBe(STRICT_VISIBILITY);
  });
});

describe("filterSnapshotForLabel", () => {
  it("passes everything through under DEFAULT_MEDICAL_VISIBILITY", () => {
    expect(
      filterSnapshotForLabel(FULL_SNAPSHOT, DEFAULT_MEDICAL_VISIBILITY),
    ).toEqual(FULL_SNAPSHOT);
  });
  it("strips medical_notes + medications under STRICT_VISIBILITY", () => {
    expect(filterSnapshotForLabel(FULL_SNAPSHOT, STRICT_VISIBILITY)).toEqual({
      allergies: "peanuts (severe), shellfish",
      medical_notes: null,
      medications: null,
    });
  });
  it("preserves null fields", () => {
    expect(
      filterSnapshotForLabel(ALLERGY_ONLY, DEFAULT_MEDICAL_VISIBILITY),
    ).toEqual(ALLERGY_ONLY);
  });
});

describe("getRosterFieldStates", () => {
  it("returns three entries in stable order", () => {
    const states = getRosterFieldStates(FULL_SNAPSHOT, DEFAULT_MEDICAL_VISIBILITY);
    expect(states.map((s) => s.field)).toEqual([
      "allergies",
      "medical_notes",
      "medications",
    ]);
  });
  it("under DEFAULT: every non-null field is visible, none require tap", () => {
    const states = getRosterFieldStates(
      FULL_SNAPSHOT,
      DEFAULT_MEDICAL_VISIBILITY,
    );
    expect(states.every((s) => s.visible && !s.requires_tap)).toBe(true);
  });
  it("under STRICT: medications hidden, medical_notes requires tap, allergies visible", () => {
    const states = getRosterFieldStates(FULL_SNAPSHOT, STRICT_VISIBILITY);
    const byField = Object.fromEntries(states.map((s) => [s.field, s]));
    expect(byField.allergies.visible).toBe(true);
    expect(byField.allergies.requires_tap).toBe(false);
    expect(byField.medical_notes.visible).toBe(true);
    expect(byField.medical_notes.requires_tap).toBe(true);
    expect(byField.medications.visible).toBe(false);
    expect(byField.medications.requires_tap).toBe(false);
  });
  it("a null value is never visible (regardless of config)", () => {
    const states = getRosterFieldStates(ALLERGY_ONLY, DEFAULT_MEDICAL_VISIBILITY);
    const byField = Object.fromEntries(states.map((s) => [s.field, s]));
    expect(byField.allergies.visible).toBe(true);
    expect(byField.medical_notes.visible).toBe(false);
    expect(byField.medications.visible).toBe(false);
  });
});

describe("snapshotHasVisibleAlert", () => {
  it("true when at least one field is visible and not tap-gated", () => {
    expect(
      snapshotHasVisibleAlert(FULL_SNAPSHOT, DEFAULT_MEDICAL_VISIBILITY),
    ).toBe(true);
  });
  it("false when all visible fields require tap", () => {
    const tapOnly: MedicalVisibility = {
      allergies: { label: true, roster: true, expand_on_tap_only: true },
      medical_notes: { label: true, roster: true, expand_on_tap_only: true },
      medications: { label: true, roster: true, expand_on_tap_only: true },
    };
    expect(snapshotHasVisibleAlert(FULL_SNAPSHOT, tapOnly)).toBe(false);
  });
  it("false when snapshot has only nulls", () => {
    expect(
      snapshotHasVisibleAlert(
        { allergies: null, medical_notes: null, medications: null },
        DEFAULT_MEDICAL_VISIBILITY,
      ),
    ).toBe(false);
  });
});
