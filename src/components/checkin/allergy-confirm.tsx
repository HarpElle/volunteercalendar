"use client";

import { useState } from "react";

interface ChildAlertData {
  id: string;
  name: string;
  allergies?: string;
  medical_notes?: string;
}

interface AllergyConfirmProps {
  childrenWithAlerts: ChildAlertData[];
  totalChildren: number;
  onConfirm: () => void;
  onBack: () => void;
  onActivity: () => void;
}

/**
 * Screen 3: Allergy/medical acknowledgment before check-in.
 * Requires individual acknowledgment for each child with alerts.
 */
export function AllergyConfirm({
  childrenWithAlerts,
  totalChildren,
  onConfirm,
  onBack,
  onActivity,
}: AllergyConfirmProps) {
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const allAcknowledged = acknowledged.size === childrenWithAlerts.length;

  const handleAcknowledge = (id: string) => {
    onActivity();
    setAcknowledged((prev) => new Set(prev).add(id));
  };

  const handleConfirm = () => {
    if (!allAcknowledged) return;
    setSubmitting(true);
    onConfirm();
  };

  return (
    <div className="flex flex-col h-full p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 mb-4">
          <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-vc-indigo font-display mb-2">
          Allergy & Medical Alerts
        </h2>
        <p className="text-gray-500">
          Please review and acknowledge each alert before checking in
        </p>
      </div>

      {/* Alert cards */}
      <div className="flex-1 overflow-y-auto space-y-4 max-w-lg mx-auto w-full">
        {childrenWithAlerts.map((child) => {
          const isAcknowledged = acknowledged.has(child.id);
          return (
            <div
              key={child.id}
              className={`
                rounded-2xl border-2 p-5 transition-all
                ${isAcknowledged
                  ? "border-vc-sage/50 bg-vc-sage/5"
                  : "border-amber-200 bg-amber-50"
                }
              `}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-bold text-lg text-vc-indigo">
                  {child.name}
                </h3>
                {isAcknowledged && (
                  <span className="text-sm font-medium text-vc-sage flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Acknowledged
                  </span>
                )}
              </div>

              {child.allergies && (
                <div className="mb-2">
                  <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                    Allergies
                  </span>
                  <p className="text-red-800 font-medium mt-0.5">
                    {child.allergies}
                  </p>
                </div>
              )}

              {child.medical_notes && (
                <div className="mb-3">
                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                    Medical Notes
                  </span>
                  <p className="text-amber-900 font-medium mt-0.5">
                    {child.medical_notes}
                  </p>
                </div>
              )}

              {!isAcknowledged && (
                <button
                  type="button"
                  onClick={() => handleAcknowledge(child.id)}
                  className="w-full h-12 rounded-xl bg-amber-600 text-white font-semibold
                    active:bg-amber-700 transition-colors mt-1"
                >
                  I Acknowledge This Alert
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-4 mt-8 max-w-lg mx-auto w-full">
        <button
          type="button"
          onClick={() => {
            onBack();
            onActivity();
          }}
          className="flex-1 h-14 rounded-full border-2 border-gray-200 text-gray-600
            font-semibold text-lg active:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!allAcknowledged || submitting}
          className="flex-1 h-14 rounded-full bg-vc-coral text-white
            font-semibold text-lg active:bg-vc-coral/90 transition-all
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Checking In...
            </span>
          ) : (
            `Check In ${totalChildren} Child${totalChildren !== 1 ? "ren" : ""}`
          )}
        </button>
      </div>
    </div>
  );
}
