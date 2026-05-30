"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import QRCode from "qrcode";
import type { CheckInHousehold, Child, ChildGrade } from "@/lib/types";

const GRADES: { value: ChildGrade; label: string }[] = [
  { value: "nursery", label: "Nursery" },
  { value: "toddler", label: "Toddler" },
  { value: "pre-k", label: "Pre-K" },
  { value: "kindergarten", label: "Kindergarten" },
  { value: "1st", label: "1st Grade" },
  { value: "2nd", label: "2nd Grade" },
  { value: "3rd", label: "3rd Grade" },
  { value: "4th", label: "4th Grade" },
  { value: "5th", label: "5th Grade" },
  { value: "6th", label: "6th Grade" },
];

/**
 * /dashboard/checkin/households/[id] — Household detail page.
 * Shows guardian info, children list, QR code management, Add Child, Edit, Delete.
 */
export default function HouseholdDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [household, setHousehold] = useState<CheckInHousehold | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [sendingQrSms, setSendingQrSms] = useState(false);
  const [qrSmsSent, setQrSmsSent] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user || !churchId || !id) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/household/${id}?church_id=${churchId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setHousehold(data.household);
        setChildren(data.children || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user, churchId, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRegenerateQR = async () => {
    if (!user || !churchId || !id) return;
    setRegenerating(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/household/${id}/regenerate-qr`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ church_id: churchId }),
        },
      );
      if (res.ok) {
        await fetchData();
      }
    } catch {
      // silent
    } finally {
      setRegenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !churchId || !id) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/household/${id}?church_id=${churchId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.ok) {
        router.push("/dashboard/checkin/households");
      }
    } catch {
      // silent
    }
  };

  // Generate QR code when household loads or changes
  useEffect(() => {
    if (!household?.qr_token || !churchId) return;
    const url = `${window.location.origin}/checkin?church_id=${churchId}&token=${household.qr_token}`;
    QRCode.toDataURL(url, {
      width: 200,
      margin: 2,
      color: { dark: "#2D3047", light: "#FEFCF9" },
    }).then(setQrDataUrl).catch(() => {});
  }, [household?.qr_token, churchId]);

  const qrKioskUrl = household?.qr_token && churchId
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/checkin?church_id=${churchId}&token=${household.qr_token}`
    : "";

  const handleDownloadQr = () => {
    if (!qrDataUrl || !household) return;
    const link = document.createElement("a");
    link.download = `checkin-qr-${household.primary_guardian_name.replace(/\s+/g, "-")}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  const handlePrintQrCard = () => {
    if (!qrDataUrl || !household) return;
    const w = window.open("", "_blank", "width=400,height=500");
    if (!w) return;
    w.document.write(`
      <html><head><title>QR Check-In Card</title>
      <style>
        body { font-family: 'Plus Jakarta Sans', sans-serif; text-align: center; padding: 40px; }
        h2 { margin: 0 0 4px; color: #2D3047; }
        p { margin: 4px 0; color: #666; font-size: 14px; }
        img { margin: 20px 0; }
        .footer { margin-top: 16px; font-size: 12px; color: #999; }
      </style></head>
      <body>
        <h2>${household.primary_guardian_name}</h2>
        <p>Family Check-In QR Code</p>
        <img src="${qrDataUrl}" width="200" height="200" />
        <p style="font-size:13px">Scan at the kiosk to check in</p>
        <div class="footer">VolunteerCal &middot; Children&rsquo;s Check-In</div>
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  const handleSendQrSms = async () => {
    if (!user || !churchId || !id) return;
    setSendingQrSms(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/checkin/households/${id}/send-qr`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ church_id: churchId }),
      });
      if (res.ok) {
        setQrSmsSent(true);
        setTimeout(() => setQrSmsSent(false), 3000);
      }
    } catch {
      // silent
    } finally {
      setSendingQrSms(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-gray-100 animate-pulse" />
        <div className="h-32 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    );
  }

  if (!household) {
    return <p className="text-gray-500">Household not found.</p>;
  }

  return (
    <div>
      <Link
        href="/dashboard/checkin/households"
        className="text-sm text-vc-coral font-medium mb-4 inline-block"
      >
        &larr; Back to Households
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-vc-indigo font-display">
          {household.primary_guardian_name}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
            </svg>
            Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
            Delete
          </Button>
        </div>
      </div>

      {/* Guardian info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Guardian Information
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-400">Primary Guardian</p>
            <p className="font-medium text-vc-indigo">
              {household.primary_guardian_name}
            </p>
            <p className="text-sm text-gray-500">
              {household.primary_guardian_phone}
            </p>
          </div>
          {household.secondary_guardian_name && (
            <div>
              <p className="text-xs text-gray-400">Secondary Guardian</p>
              <p className="font-medium text-vc-indigo">
                {household.secondary_guardian_name}
              </p>
              <p className="text-sm text-gray-500">
                {household.secondary_guardian_phone || "\u2014"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* QR Code */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          QR Check-In Code
        </h2>
        <div className="flex flex-col sm:flex-row items-start gap-4">
          {qrDataUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={qrDataUrl}
              alt="Family check-in QR code"
              className="rounded-lg flex-shrink-0"
              width={160}
              height={160}
            />
          ) : (
            <div className="w-[160px] h-[160px] bg-gray-50 rounded-lg flex items-center justify-center text-gray-300 text-sm">
              Loading...
            </div>
          )}
          <div className="flex-1 space-y-2">
            <p className="text-sm text-vc-text-secondary">
              Family members scan this code at the kiosk for instant check-in.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadQr}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-vc-border-light text-vc-indigo
                  font-medium rounded-lg hover:bg-vc-bg-warm transition-colors text-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download
              </button>
              <button
                type="button"
                onClick={handlePrintQrCard}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-vc-border-light text-vc-indigo
                  font-medium rounded-lg hover:bg-vc-bg-warm transition-colors text-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.75 12h.008v.008h-.008V12Zm-1.5 0h.008v.008H17.25V12Z" />
                </svg>
                Print Card
              </button>
              {household.primary_guardian_phone && (
                <button
                  type="button"
                  onClick={handleSendQrSms}
                  disabled={sendingQrSms}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-vc-border-light text-vc-indigo
                    font-medium rounded-lg hover:bg-vc-bg-warm transition-colors text-sm disabled:opacity-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                  </svg>
                  {qrSmsSent ? "Sent!" : sendingQrSms ? "Sending..." : "Send via SMS"}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleRegenerateQR}
                disabled={regenerating}
                className="text-xs text-vc-coral font-medium underline disabled:opacity-50"
              >
                {regenerating ? "Regenerating..." : "Regenerate QR"}
              </button>
              <span className="text-xs text-gray-400">
                Invalidates the old code
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Children */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Children ({children.length})
          </h2>
          <Button size="sm" onClick={() => setShowAddChild(true)}>
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Child
          </Button>
        </div>
        {children.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400">No children registered</p>
            <button
              onClick={() => setShowAddChild(true)}
              className="mt-2 text-sm text-vc-coral hover:text-vc-coral-dark font-medium transition-colors"
            >
              Add the first child
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {children.map((child) => (
              <div key={child.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-vc-indigo">
                    {child.preferred_name || child.first_name} {child.last_name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {child.grade && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-vc-indigo/10 text-vc-indigo/70">
                        {child.grade}
                      </span>
                    )}
                    {child.has_alerts && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        Allergy/Medical
                      </span>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-medium ${child.is_active ? "text-vc-sage" : "text-gray-400"}`}>
                  {child.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddChild && (
          <AddChildModal
            householdId={household.id}
            onClose={() => setShowAddChild(false)}
            onCreated={() => {
              setShowAddChild(false);
              fetchData();
            }}
          />
        )}
        {showEdit && (
          <EditHouseholdModal
            household={household}
            onClose={() => setShowEdit(false)}
            onSaved={() => {
              setShowEdit(false);
              fetchData();
            }}
          />
        )}
        {showDelete && (
          <DeleteHouseholdModal
            householdName={household.primary_guardian_name}
            childrenCount={children.length}
            onClose={() => setShowDelete(false)}
            onConfirm={handleDelete}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared styles                                                      */
/* ------------------------------------------------------------------ */

const inputClasses =
  "w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none transition-colors text-sm";
const labelClasses = "block text-sm font-medium text-vc-indigo mb-1";

/* ------------------------------------------------------------------ */
/*  Edit Household Modal                                               */
/* ------------------------------------------------------------------ */

interface EditHouseholdModalProps {
  household: CheckInHousehold;
  onClose: () => void;
  onSaved: () => void;
}

function EditHouseholdModal({ household, onClose, onSaved }: EditHouseholdModalProps) {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [primaryName, setPrimaryName] = useState(household.primary_guardian_name);
  const [primaryPhone, setPrimaryPhone] = useState(household.primary_guardian_phone);
  const [secondaryName, setSecondaryName] = useState(household.secondary_guardian_name || "");
  const [secondaryPhone, setSecondaryPhone] = useState(household.secondary_guardian_phone || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasSecondary = !!(household.secondary_guardian_name);
  const [showSecondary, setShowSecondary] = useState(hasSecondary);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !churchId) return;
    setError("");
    setSaving(true);

    try {
      const token = await user.getIdToken();
      const body: Record<string, string | null> = {
        church_id: churchId,
        primary_guardian_name: primaryName.trim(),
        primary_guardian_phone: primaryPhone.trim(),
      };

      if (showSecondary) {
        body.secondary_guardian_name = secondaryName.trim() || null;
        body.secondary_guardian_phone = secondaryPhone.trim() || null;
      } else {
        // Clear secondary guardian
        body.secondary_guardian_name = null;
        body.secondary_guardian_phone = null;
      }

      const res = await fetch(`/api/admin/checkin/household/${household.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to update (${res.status})`);
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 12 }}
        transition={{ type: "spring", duration: 0.35 }}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <h2 className="font-display text-lg font-semibold text-vc-indigo mb-1">
          Edit Household
        </h2>
        <p className="text-sm text-vc-text-secondary mb-5">
          Update guardian names and phone numbers.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="edit-primary-name" className={labelClasses}>
              Primary guardian name <span className="text-vc-coral">*</span>
            </label>
            <input
              id="edit-primary-name"
              type="text"
              required
              value={primaryName}
              onChange={(e) => setPrimaryName(e.target.value)}
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="edit-primary-phone" className={labelClasses}>
              Phone number <span className="text-vc-coral">*</span>
            </label>
            <input
              id="edit-primary-phone"
              type="tel"
              required
              value={primaryPhone}
              onChange={(e) => setPrimaryPhone(e.target.value)}
              className={inputClasses}
            />
          </div>

          {/* Secondary guardian */}
          {!showSecondary ? (
            <button
              type="button"
              onClick={() => setShowSecondary(true)}
              className="text-sm text-vc-coral hover:text-vc-coral-dark font-medium transition-colors flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add secondary guardian
            </button>
          ) : (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-vc-indigo">Secondary guardian</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowSecondary(false);
                    setSecondaryName("");
                    setSecondaryPhone("");
                  }}
                  className="text-xs text-vc-text-muted hover:text-vc-text-secondary transition-colors"
                >
                  Remove
                </button>
              </div>
              <div>
                <label htmlFor="edit-secondary-name" className={labelClasses}>Name</label>
                <input
                  id="edit-secondary-name"
                  type="text"
                  value={secondaryName}
                  onChange={(e) => setSecondaryName(e.target.value)}
                  className={inputClasses}
                />
              </div>
              <div>
                <label htmlFor="edit-secondary-phone" className={labelClasses}>Phone</label>
                <input
                  id="edit-secondary-phone"
                  type="tel"
                  value={secondaryPhone}
                  onChange={(e) => setSecondaryPhone(e.target.value)}
                  className={inputClasses}
                />
              </div>
            </motion.div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" type="submit" loading={saving} disabled={!primaryName.trim() || !primaryPhone.trim()}>
              Save Changes
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Delete Household Confirmation                                      */
/* ------------------------------------------------------------------ */

interface DeleteHouseholdModalProps {
  householdName: string;
  childrenCount: number;
  onClose: () => void;
  onConfirm: () => void;
}

function DeleteHouseholdModal({ householdName, childrenCount, onClose, onConfirm }: DeleteHouseholdModalProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await onConfirm();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 12 }}
        transition={{ type: "spring", duration: 0.35 }}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="font-display text-lg font-semibold text-vc-indigo mb-2">
          Delete Household?
        </h2>
        <p className="text-sm text-vc-text-secondary mb-1">
          This will permanently delete the <strong>{householdName}</strong> household
          {childrenCount > 0 && (
            <> and {childrenCount} child{childrenCount !== 1 ? "ren" : ""} registered to it</>
          )}.
        </p>
        <p className="text-sm text-red-600 mb-5">
          This action cannot be undone.
        </p>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
            Delete Household
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Add Child Modal                                                    */
/* ------------------------------------------------------------------ */

interface AddChildModalProps {
  householdId: string;
  onClose: () => void;
  onCreated: () => void;
}

function AddChildModal({ householdId, onClose, onCreated }: AddChildModalProps) {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [grade, setGrade] = useState("");
  const [allergies, setAllergies] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !churchId) return;
    setError("");
    setSaving(true);

    try {
      const token = await user.getIdToken();
      const body: Record<string, string> = {
        church_id: churchId,
        household_id: householdId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      };
      if (grade) body.grade = grade;
      if (allergies.trim()) body.allergies = allergies.trim();
      if (medicalNotes.trim()) body.medical_notes = medicalNotes.trim();

      const res = await fetch("/api/admin/checkin/children", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to add child (${res.status})`);
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 12 }}
        transition={{ type: "spring", duration: 0.35 }}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <h2 className="font-display text-lg font-semibold text-vc-indigo mb-1">
          Add Child
        </h2>
        <p className="text-sm text-vc-text-secondary mb-5">
          Register a child in this household for check-in.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="child-first" className={labelClasses}>
                First name <span className="text-vc-coral">*</span>
              </label>
              <input
                id="child-first"
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor="child-last" className={labelClasses}>
                Last name <span className="text-vc-coral">*</span>
              </label>
              <input
                id="child-last"
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={inputClasses}
              />
            </div>
          </div>

          <div>
            <label htmlFor="child-grade" className={labelClasses}>Grade</label>
            <select
              id="child-grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className={inputClasses}
            >
              <option value="">Select grade...</option>
              {GRADES.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="child-allergies" className={labelClasses}>
              Allergies
            </label>
            <input
              id="child-allergies"
              type="text"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="e.g. peanuts, dairy"
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="child-medical" className={labelClasses}>
              Medical notes
            </label>
            <textarea
              id="child-medical"
              value={medicalNotes}
              onChange={(e) => setMedicalNotes(e.target.value)}
              placeholder="Any medical conditions or special instructions..."
              rows={2}
              className={`${inputClasses} resize-none`}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" type="submit" loading={saving} disabled={!firstName.trim() || !lastName.trim()}>
              Add Child
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
