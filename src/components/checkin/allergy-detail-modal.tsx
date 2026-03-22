"use client";

import { useEffect } from "react";

interface AllergyDetailModalProps {
  childName: string;
  allergies?: string;
  medicalNotes?: string;
  parentPhoneMasked: string;
  onClose: () => void;
}

/**
 * Modal showing allergy/medical details for a child in the teacher room view.
 * Includes masked parent phone for emergency reference.
 */
export function AllergyDetailModal({
  childName,
  allergies,
  medicalNotes,
  parentPhoneMasked,
  onClose,
}: AllergyDetailModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

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
          {allergies && (
            <div>
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">
                Allergies
              </p>
              <p className="text-red-800 font-medium bg-red-50 rounded-lg p-3">
                {allergies}
              </p>
            </div>
          )}

          {medicalNotes && (
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
                Medical Notes
              </p>
              <p className="text-amber-900 font-medium bg-amber-50 rounded-lg p-3">
                {medicalNotes}
              </p>
            </div>
          )}

          {!allergies && !medicalNotes && (
            <p className="text-gray-500 text-center py-4">
              No alerts on file
            </p>
          )}

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
