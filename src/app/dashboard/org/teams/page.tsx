"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { isAdmin } from "@/lib/utils/permissions";
import { getOrgTerms } from "@/lib/utils/org-terms";
import { TIER_LIMITS } from "@/lib/constants";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import type { Ministry, Church } from "@/lib/types";
import { TeamsSettings } from "@/components/settings/teams-settings";
import { AccessDenied } from "@/components/ui/access-denied";

export default function TeamsPage() {
  const { user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [church, setChurch] = useState<Church | null>(null);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutationError, setMutationError] = useState("");

  useEffect(() => {
    if (!churchId) { setLoading(false); return; }
    async function load() {
      try {
        const [churchSnap, minDocs] = await Promise.all([
          getDoc(doc(db, "churches", churchId!)),
          getChurchDocuments(churchId!, "ministries"),
        ]);
        if (churchSnap.exists()) {
          setChurch({ id: churchSnap.id, ...churchSnap.data() } as unknown as Church);
        }
        setMinistries(
          (minDocs as unknown as Ministry[]).sort((a, b) => a.name.localeCompare(b.name)),
        );
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  if (!isAdmin(activeMembership)) return <AccessDenied requiredRole="Admin" />;

  const currentTier = church?.subscription_tier || "free";
  const limits = TIER_LIMITS[currentTier] || TIER_LIMITS.free;
  const orgType = church?.org_type || "church";
  const terms = getOrgTerms(orgType);
  const ministryLimitReached =
    limits.ministries !== Infinity && ministries.length >= limits.ministries;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Teams</h1>
        <p className="mt-1 text-vc-text-secondary">
          Manage your {terms.pluralLower} and volunteer groups.
        </p>
      </div>

      {mutationError && (
        <div className="mb-6 rounded-xl border border-vc-danger/20 bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
          {mutationError}
        </div>
      )}

      <TeamsSettings
        churchId={churchId!}
        ministries={ministries}
        setMinistries={setMinistries}
        ministryLimitReached={ministryLimitReached}
        terms={terms}
        currentTier={currentTier}
        shortLinksLimit={0}
        hideShortLinks
        mutationError={mutationError}
        setMutationError={setMutationError}
        user={user}
        activeMembership={activeMembership}
      />
    </div>
  );
}
