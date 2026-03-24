"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { isOwner } from "@/lib/utils/permissions";
import { getOrgTerms } from "@/lib/utils/org-terms";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import type { Church, Ministry, Volunteer } from "@/lib/types";
import { BillingSettings } from "@/components/settings/billing-settings";

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const { user, profile, activeMembership } = useAuth();
  const searchParams = useSearchParams();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [church, setChurch] = useState<Church | null>(null);
  const [volunteerCount, setVolunteerCount] = useState(0);
  const [activeEventCount, setActiveEventCount] = useState(0);
  const [ministriesCount, setMinistriesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [mutationError, setMutationError] = useState("");

  const billingSuccess = searchParams.get("success") === "true";
  const billingCanceled = searchParams.get("canceled") === "true";

  const isPlatformSuperadmin = (() => {
    const uids = (process.env.NEXT_PUBLIC_PLATFORM_ADMIN_UIDS || "")
      .split(",")
      .map((s) => s.trim());
    return user ? uids.includes(user.uid) : false;
  })();

  useEffect(() => {
    if (!churchId) { setLoading(false); return; }
    async function load() {
      try {
        const [churchSnap, volDocs, eventDocs, minDocs] = await Promise.all([
          getDoc(doc(db, "churches", churchId!)),
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "events"),
          getChurchDocuments(churchId!, "ministries"),
        ]);
        if (churchSnap.exists()) {
          setChurch({ id: churchSnap.id, ...churchSnap.data() } as unknown as Church);
        }
        setVolunteerCount((volDocs as unknown as Volunteer[]).length);
        setMinistriesCount((minDocs as unknown as Ministry[]).length);
        const events = eventDocs as unknown as { id: string; status?: string }[];
        setActiveEventCount(
          events.filter((e) => !e.status || e.status === "active" || e.status === "draft").length,
        );
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  if (!isOwner(activeMembership) && !isPlatformSuperadmin) return null;

  const currentTier = church?.subscription_tier || "free";
  const orgType = church?.org_type || "church";
  const terms = getOrgTerms(orgType);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!church) return null;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Billing</h1>
        <p className="mt-1 text-vc-text-secondary">
          Manage your subscription plan and usage.
        </p>
      </div>

      {mutationError && (
        <div className="mb-6 rounded-xl border border-vc-danger/20 bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
          {mutationError}
        </div>
      )}

      <BillingSettings
        churchId={churchId!}
        church={church}
        setChurch={setChurch}
        currentTier={currentTier}
        volunteerCount={volunteerCount}
        activeEventCount={activeEventCount}
        ministriesCount={ministriesCount}
        terms={terms}
        isPlatformSuperadmin={isPlatformSuperadmin}
        mutationError={mutationError}
        setMutationError={setMutationError}
        activeMembership={activeMembership}
        billingSuccess={billingSuccess}
        billingCanceled={billingCanceled}
      />
    </div>
  );
}
