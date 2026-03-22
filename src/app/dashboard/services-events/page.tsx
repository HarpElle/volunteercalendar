"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { TabBar } from "@/components/ui/tab-bar";
import { ServicesList } from "@/components/services/services-list";
import { EventList } from "@/components/services/event-list";
import type { Ministry } from "@/lib/types";

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ServicesEventsPage() {
  return (
    <Suspense>
      <ServicesEventsContent />
    </Suspense>
  );
}

function ServicesEventsContent() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "events" ? "events" : "services";
  const [tab, setTab] = useState<"services" | "events">(initialTab);

  const { profile, user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [churchName, setChurchName] = useState("");
  const [churchTier, setChurchTier] = useState("free");
  const [loading, setLoading] = useState(true);

  // Shared data: ministries + church name + tier
  useEffect(() => {
    if (!churchId) return;
    Promise.all([
      getChurchDocuments(churchId, "ministries"),
      import("firebase/firestore").then(({ doc, getDoc }) =>
        getDoc(doc(db, "churches", churchId)),
      ),
    ])
      .then(([mins, churchSnap]) => {
        setMinistries(mins as unknown as Ministry[]);
        if (churchSnap.exists()) {
          setChurchName(churchSnap.data().name || "");
          setChurchTier(churchSnap.data().subscription_tier || "free");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [churchId]);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Services & Events</h1>
        <p className="mt-1 text-vc-text-secondary">
          Configure recurring services and create events that need volunteers.
        </p>
      </div>

      {/* Tabs */}
      <TabBar
        tabs={[
          { key: "services" as const, label: "Services" },
          { key: "events" as const, label: "Events" },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-6"
      />

      {tab === "services" ? (
        <ServicesList
          churchId={churchId}
          churchName={churchName}
          churchTier={churchTier}
          activeMembership={activeMembership}
          ministries={ministries}
          loading={loading}
        />
      ) : (
        <EventList
          churchId={churchId}
          churchName={churchName}
          churchTier={churchTier}
          user={user}
          activeMembership={activeMembership}
          ministries={ministries}
          loading={loading}
        />
      )}
    </div>
  );
}
