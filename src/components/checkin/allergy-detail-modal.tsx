"use client";

import { useEffect, useState } from "react";

/** Wave 9 P0-4 sub-PR C: per-field render plan. Matches
 *  `RosterFieldState` from `@/lib/server/medical-visibility`. */
interface MedicalField {
  field: "allergies" | "medical_notes" | "medications";
  value: string | null;
  visible: boolean;
  requires_tap: boolean;
}

interface AllergyDetailModalProps {
  childName: string;
  medicalFields: MedicalField[];
  parentPhoneMasked: string;
  /** Fire when the operator taps to reveal a `requires_tap` field.
   *  Caller is responsible for the network call + audit fan-out;
   *  the modal just calls this and updates its local reveal state. */
  onRevealField?: (field: MedicalField["field"]) => void | Promise<void>;
  onClose: () => void;
}

const FIELD_HEADERS: Record<
  MedicalField["field"],
  { label: string; tone: "danger" | "warning" | "info" }
> = {
  allergies: { label: "Allergies", tone: "danger" },
  medical_notes: { label: "Medical Notes", tone: "warning" },
  medications: { label: "Medications", tone: "info" },
};

const TONE_CLASSES = {
  danger: {
    header: "text-red-600",
    body: "text-red-800 bg-red-50",
  },
  warning: {
    header: "text-amber-700",
    body: "text-amber-900 bg-amber-50",
  },
  info: {
    header: "text-vc-indigo",
    body: "text-vc-indigo bg-vc-indigo/5",
  },
};

/**
 * Modal showing allergy/medical details for a child in the teacher
 * room view. Wave 9 P0-4: consumes the per-field render plan from
 * `medical_fields` instead of flat strings. Fields with
 * `requires_tap: true` render a "Tap to reveal" placeholder until
 * the operator taps — at which point `onRevealField` fires (which
 * the room page wires to the audit endpoint).
 *
 * Includes masked parent phone for emergency reference.
 */
export function AllergyDetailModal({
  childName,
  medicalFields,
  parentPhoneMasked,
  onRevealField,
  onClose,
}: AllergyDetailModalProps) {
  // Local revealed state — once revealed, the field stays revealed
  // for the rest of this modal-open session.
  const [revealed, setRevealed] = useState<Set<MedicalField["field"]>>(
    new Set(),
  );

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  function handleReveal(field: MedicalField["field"]) {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
    if (onRevealField) {
      void onRevealField(field);
    }
  }

  const visibleFields = medicalFields.filter((f) => f.visible && f.value);
  const hasAnything = visibleFields.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100">
          <h3 className="text-xl font-bold text-vc-indigo font-display">
            {childName}
          </h3>
        </div>

        <div className="p-6 space-y-4">
          {!hasAnything && (
            <p className="text-gray-500 text-center py-4">
              No alerts on file
            </p>
          )}

          {visibleFields.map((entry) => {
            const header = FIELD_HEADERS[entry.field];
            const tone = TONE_CLASSES[header.tone];
            const isRevealed = !entry.requires_tap || revealed.has(entry.field);
            return (
              <div key={entry.field}>
                <p
                  className={`text-xs font-semibold uppercase tracking-wide mb-1 ${tone.header}`}
                >
                  {header.label}
                </p>
                {isRevealed ? (
                  <p
                    className={`font-medium rounded-lg p-3 ${tone.body} whitespace-pre-wrap`}
                  >
                    {entry.value}
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleReveal(entry.field)}
                    className="w-full text-left rounded-lg p-3 border border-dashed border-vc-border-light text-vc-text-muted hover:border-vc-coral hover:text-vc-coral transition-colors min-h-[44px]"
                  >
                    Tap to reveal · {header.label.toLowerCase()}
                  </button>
                )}
              </div>
            );
          })}

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
              Parent Phone
            </p>
            <p className="text-gray-700 font-medium">{parentPhoneMasked}</p>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-12 rounded-full bg-vc-indigo text-white font-semibold
              active:bg-vc-indigo/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
