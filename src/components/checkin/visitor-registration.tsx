"use client";

import { useState } from "react";
import { kioskFetch } from "@/lib/kiosk-client";

interface ChildInput {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  grade: string;
  allergies: string;
  medical_notes: string;
}

interface VisitorRegistrationProps {
  churchId: string;
  onRegistered: (result: {
    household_id: string;
    qr_token: string;
    children: { id: string; first_name: string; last_name: string }[];
  }) => void;
  onBack: () => void;
  onActivity: () => void;
}

const GRADES = [
  { value: "nursery", label: "Nursery" },
  { value: "pre_k", label: "Pre-K" },
  { value: "kindergarten", label: "Kindergarten" },
  { value: "1st", label: "1st" },
  { value: "2nd", label: "2nd" },
  { value: "3rd", label: "3rd" },
  { value: "4th", label: "4th" },
  { value: "5th", label: "5th" },
  { value: "6th", label: "6th" },
];

const emptyChild = (): ChildInput => ({
  first_name: "",
  last_name: "",
  date_of_birth: "",
  grade: "",
  allergies: "",
  medical_notes: "",
});

/**
 * Kiosk-friendly first-time visitor registration form.
 * Creates household + children via POST /api/checkin/register,
 * then transitions to child selection for immediate check-in.
 */
export function VisitorRegistration({
  churchId,
  onRegistered,
  onBack,
  onActivity,
}: VisitorRegistrationProps) {
  const [step, setStep] = useState<"guardian" | "children" | "review">(
    "guardian",
  );
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [secondaryName, setSecondaryName] = useState("");
  const [secondaryPhone, setSecondaryPhone] = useState("");
  const [children, setChildren] = useState<ChildInput[]>([emptyChild()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const updateChild = (index: number, field: keyof ChildInput, value: string) => {
    onActivity();
    setChildren((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addChild = () => {
    onActivity();
    setChildren((prev) => [...prev, emptyChild()]);
  };

  const removeChild = (index: number) => {
    onActivity();
    if (children.length > 1) {
      setChildren((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const guardianValid = guardianName.trim().length >= 2 && guardianPhone.replace(/\D/g, "").length >= 10;
  const childrenValid = children.every(
    (c) => c.first_name.trim() && c.last_name.trim(),
  );

  const handleSubmit = async () => {
    onActivity();
    setSubmitting(true);
    setError("");

    try {
      const res = await kioskFetch("/api/checkin/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          church_id: churchId,
          primary_guardian_name: guardianName.trim(),
          primary_guardian_phone: guardianPhone.replace(/\D/g, ""),
          secondary_guardian_name: secondaryName.trim() || undefined,
          secondary_guardian_phone:
            secondaryPhone.replace(/\D/g, "").length >= 10
              ? secondaryPhone.replace(/\D/g, "")
              : undefined,
          children: children.map((c) => ({
            first_name: c.first_name.trim(),
            last_name: c.last_name.trim(),
            date_of_birth: c.date_of_birth || undefined,
            grade: c.grade || undefined,
            allergies: c.allergies.trim() || undefined,
            medical_notes: c.medical_notes.trim() || undefined,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Registration failed. Please try again.");
        return;
      }

      const result = await res.json();
      onRegistered(result);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Format phone as user types: (555) 555-5555
  const formatPhone = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <button
          type="button"
          onClick={() => {
            onActivity();
            if (step === "children") setStep("guardian");
            else if (step === "review") setStep("children");
            else onBack();
          }}
          className="flex items-center gap-2 text-gray-500 active:text-vc-indigo
            min-h-[44px] min-w-[44px] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-lg">Back</span>
        </button>
        <div className="text-sm text-gray-400 font-medium">
          Step {step === "guardian" ? "1" : step === "children" ? "2" : "3"} of 3
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-32">
        {/* Step 1: Guardian */}
        {step === "guardian" && (
          <div className="max-w-lg mx-auto">
            <h2 className="text-2xl font-bold text-vc-indigo font-display mb-1">
              Welcome!
            </h2>
            <p className="text-gray-500 mb-6">
              Let&apos;s get your family registered.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Your Name *
                </label>
                <input
                  type="text"
                  value={guardianName}
                  onChange={(e) => {
                    onActivity();
                    setGuardianName(e.target.value);
                  }}
                  placeholder="First and Last Name"
                  autoComplete="off"
                  className="w-full h-14 px-4 rounded-xl border border-gray-200 text-lg
                    focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={formatPhone(guardianPhone)}
                  onChange={(e) => {
                    onActivity();
                    setGuardianPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                  }}
                  placeholder="(555) 555-5555"
                  autoComplete="off"
                  className="w-full h-14 px-4 rounded-xl border border-gray-200 text-lg
                    focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                />
              </div>

              <div className="pt-2 border-t border-gray-100 mt-2">
                <p className="text-sm text-gray-400 mb-3">Optional — second guardian</p>
                <div className="space-y-4">
                  <input
                    type="text"
                    value={secondaryName}
                    onChange={(e) => {
                      onActivity();
                      setSecondaryName(e.target.value);
                    }}
                    placeholder="Second Guardian Name"
                    autoComplete="off"
                    className="w-full h-14 px-4 rounded-xl border border-gray-200 text-lg
                      focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                  />
                  <input
                    type="tel"
                    value={formatPhone(secondaryPhone)}
                    onChange={(e) => {
                      onActivity();
                      setSecondaryPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                    }}
                    placeholder="(555) 555-5555"
                    autoComplete="off"
                    className="w-full h-14 px-4 rounded-xl border border-gray-200 text-lg
                      focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Children */}
        {step === "children" && (
          <div className="max-w-lg mx-auto">
            <h2 className="text-2xl font-bold text-vc-indigo font-display mb-1">
              Add Your Children
            </h2>
            <p className="text-gray-500 mb-6">
              Name and grade are required. Allergy info helps our volunteers keep your children safe.
            </p>

            <div className="space-y-6">
              {children.map((child, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-gray-200 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-vc-indigo">
                      Child {i + 1}
                    </span>
                    {children.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeChild(i)}
                        className="text-sm text-red-400 active:text-red-600 min-h-[44px]
                          min-w-[44px] flex items-center justify-center transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={child.first_name}
                      onChange={(e) => updateChild(i, "first_name", e.target.value)}
                      placeholder="First Name *"
                      autoComplete="off"
                      className="h-12 px-3 rounded-lg border border-gray-200 text-base
                        focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                    />
                    <input
                      type="text"
                      value={child.last_name}
                      onChange={(e) => updateChild(i, "last_name", e.target.value)}
                      placeholder="Last Name *"
                      autoComplete="off"
                      className="h-12 px-3 rounded-lg border border-gray-200 text-base
                        focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Date of Birth</label>
                      <input
                        type="date"
                        value={child.date_of_birth}
                        onChange={(e) => updateChild(i, "date_of_birth", e.target.value)}
                        className="w-full h-12 px-3 rounded-lg border border-gray-200 text-base
                          focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Grade</label>
                      <select
                        value={child.grade}
                        onChange={(e) => updateChild(i, "grade", e.target.value)}
                        className="w-full h-12 px-3 rounded-lg border border-gray-200 text-base
                          focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none
                          bg-white"
                      >
                        <option value="">Select...</option>
                        {GRADES.map((g) => (
                          <option key={g.value} value={g.value}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={child.allergies}
                    onChange={(e) => updateChild(i, "allergies", e.target.value)}
                    placeholder="Allergies (e.g., peanuts, dairy)"
                    autoComplete="off"
                    className="w-full h-12 px-3 rounded-lg border border-gray-200 text-base
                      focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                  />
                  <input
                    type="text"
                    value={child.medical_notes}
                    onChange={(e) => updateChild(i, "medical_notes", e.target.value)}
                    placeholder="Medical notes (optional)"
                    autoComplete="off"
                    className="w-full h-12 px-3 rounded-lg border border-gray-200 text-base
                      focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={addChild}
                className="w-full h-14 rounded-xl border-2 border-dashed border-gray-200
                  text-gray-500 font-medium text-base
                  active:border-vc-coral active:text-vc-coral transition-colors"
              >
                + Add Another Child
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === "review" && (
          <div className="max-w-lg mx-auto">
            <h2 className="text-2xl font-bold text-vc-indigo font-display mb-1">
              Review &amp; Register
            </h2>
            <p className="text-gray-500 mb-6">
              Please confirm your information is correct.
            </p>

            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Guardian
                </h3>
                <p className="text-lg font-medium text-vc-indigo">{guardianName}</p>
                <p className="text-gray-500">{formatPhone(guardianPhone)}</p>
                {secondaryName && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-base text-vc-indigo">{secondaryName}</p>
                    {secondaryPhone && (
                      <p className="text-sm text-gray-500">{formatPhone(secondaryPhone)}</p>
                    )}
                  </div>
                )}
              </div>

              {children.map((child, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-gray-200 p-4"
                >
                  <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Child {i + 1}
                  </h3>
                  <p className="text-lg font-medium text-vc-indigo">
                    {child.first_name} {child.last_name}
                  </p>
                  {child.grade && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-vc-sage/15 text-vc-sage text-xs font-medium">
                      {GRADES.find((g) => g.value === child.grade)?.label || child.grade}
                    </span>
                  )}
                  {child.allergies && (
                    <p className="text-sm text-red-500 mt-1">
                      Allergies: {child.allergies}
                    </p>
                  )}
                  {child.medical_notes && (
                    <p className="text-sm text-gray-500 mt-1">
                      Medical: {child.medical_notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-vc-bg/95 backdrop-blur-sm
        border-t border-gray-100 px-6 py-4 safe-area-pb">
        {error && (
          <p className="text-red-500 text-sm text-center mb-3">{error}</p>
        )}

        {step === "guardian" && (
          <button
            type="button"
            onClick={() => {
              onActivity();
              setStep("children");
            }}
            disabled={!guardianValid}
            className="w-full max-w-lg mx-auto block h-14 rounded-full bg-vc-coral text-white
              font-semibold text-lg transition-all
              disabled:opacity-40 disabled:cursor-not-allowed
              active:scale-[0.98] active:bg-vc-coral/90"
          >
            Next — Add Children
          </button>
        )}

        {step === "children" && (
          <button
            type="button"
            onClick={() => {
              onActivity();
              setStep("review");
            }}
            disabled={!childrenValid}
            className="w-full max-w-lg mx-auto block h-14 rounded-full bg-vc-coral text-white
              font-semibold text-lg transition-all
              disabled:opacity-40 disabled:cursor-not-allowed
              active:scale-[0.98] active:bg-vc-coral/90"
          >
            Review
          </button>
        )}

        {step === "review" && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full max-w-lg mx-auto block h-14 rounded-full bg-vc-coral text-white
              font-semibold text-lg transition-all
              disabled:opacity-50
              active:scale-[0.98] active:bg-vc-coral/90"
          >
            {submitting ? "Registering..." : "Register Family"}
          </button>
        )}
      </div>
    </div>
  );
}
