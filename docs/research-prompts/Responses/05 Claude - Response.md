# VolunteerCal — Unified Implementation Plan

**Synthesized from:** Perplexity Pro (Market Research), ChatGPT Pro (UX Teardown), SuperGrok Heavy (Strategy), Gemini Ultra (Architecture)
**Target:** Claude Code execution — paste each phase as a session instruction
**Date:** April 4, 2026

---

## Strategic Context (Read First, Don't Implement)

### Current Phase: Anchor Falls First

VolunteerCal was built to solve a real problem — equipping the Service Experience Director role at Anchor Falls Church. The immediate goal is **a premier experience for your own church**: smooth Sunday mornings, reliable scheduling, solid check-in, and a feedback loop that makes the tool better every week. This IS the product validation phase — you are the most demanding user and the SED role is the highest-stakes context.

**SaaS expansion comes later.** When volleyball season winds down (~2 months), that margin time opens up for marketing and onboarding additional churches. By then, Anchor Falls will have battle-tested the product through real Sundays, and you'll have an organic case study.

### Future SaaS Context (Preserved from Research)

When you're ready to expand beyond Anchor Falls:

**Market position:** Target the ~89,000 US churches with 50–99 weekly attendees. Only ~25% use dedicated ChMS. Your unified platform in one login is the correct positioning against PCO's fragmented module system.

**Pricing model:** Flat tiers, not per-person. Free (15 vols), Starter $19/mo, Growth $49/mo, Pro $99/mo. Feature-gate check-in at Growth tier.

**Core moat:** Volunteer retention intelligence — burnout alerts, serving-frequency caps, fatigue tracking. No incumbent operationalizes this deeply in product.

**What NOT to build:** Giving (integrate Tithe.ly), website builder, small groups, native mobile app (stick with PWA). Background checks: integrate Protect My Ministry.

---

## Architectural Decisions (Synthesis + Rationale)

### Decision 1: Children as Person Documents (Not Subcollection)

**Final answer:** Children ARE `Person` documents with `person_type: "child"`. Not a subcollection under Household.

**Why:** The check-in kiosk flow is 2 Firestore round-trips either way: (1) find adult by phone, get `household_id`, (2) query all people with that `household_id`. If children were a subcollection under Household, you'd need a third read to the subcollection. Flat `people` collection with `household_id` field enables a single `where("household_id", "==", id)` query that returns adults AND children together.

**Gemini follow-up security concern addressed:** Children's sensitive data (medical notes, allergies, custody/authorized pickups) lives on the `child_profile` embedded object within the Person document. Firestore has no field-level read security. **Mitigation:** All reads to `people` collection that return `child_profile` data must go through Next.js Server Components or Server Actions using `firebase-admin`. Client-side reads for non-sensitive contexts (schedule roster display) use a DTO pattern that strips `child_profile` before sending to browser. This is Phase 2 work — for Phase 0-1, the beta church has ~10 records and the admin IS the data owner, so the risk is near-zero.

### Decision 2: Scheduling Fields Inline on Person

**Final answer:** `scheduling_profile` is an embedded map directly on the Person document, not a subcollection.

**Why:** The scheduling algorithm does `where("is_volunteer", "==", true), where("status", "==", "active"), where("ministry_ids", "array-contains", ministryId)` — one query returning all candidates. If scheduling data were in a subcollection, the algorithm would need N additional reads (one per volunteer). At 100+ volunteers, that's 100+ extra Firestore reads per schedule generation. Unacceptable.

**Trade-off acknowledged:** Person documents will be ~1-2KB each. Well within Firestore's 1MB limit. A church with 500 people = ~1MB total collection size. No risk.

### Decision 3: `volunteer_id` → `person_id` on Assignments

**Final answer:** Add `person_id` field to Assignment. Keep `volunteer_id` as a deprecated alias during migration. The compatibility layer reads `person_id ?? volunteer_id` so existing assignments don't break.

**Migration strategy:** The migration script sets `person_id` on all existing assignments. New assignments write `person_id` only. After all UI components are updated (Phase 1), `volunteer_id` becomes dead weight that can be cleaned up in a future sweep.

### Decision 4: Household for Blended Families

**Final answer:** `household_ids: string[]` on Person (not singular `household_id: string`).

**Why (from Gemini follow-up):** Divorced parents with joint custody. If 8-year-old Timmy is in Mom's household only, Dad can't check him in at the kiosk because Dad's phone pulls up Dad's household. With `household_ids: string[]`, Timmy appears in both parents' households. Check-in query becomes `where("household_ids", "array-contains", foundHouseholdId)`.

**Scheduling impact:** The `never_same_time` constraint evaluates per-household. When a person belongs to multiple households, the algorithm checks ALL of them — correct behavior for preventing scheduling conflicts where either parent needs to be home.

### Decision 5: Feature Gating Architecture

**Final answer:** Add `feature_flags` to the `Church` document, derived from `subscription_tier`. The UI checks `church.feature_flags.checkin_enabled` rather than `church.subscription_tier === "growth"`. This decouples features from tiers, enabling manual overrides (beta testers, founding church discounts).

```typescript
interface FeatureFlags {
  checkin_enabled: boolean;
  rooms_enabled: boolean;
  stage_sync_enabled: boolean;
  service_planning_enabled: boolean;
  max_volunteers: number;     // -1 = unlimited
  max_teams: number;          // -1 = unlimited
  retention_dashboard: boolean;
  background_checks: boolean;
  calendar_feeds: boolean;
  custom_notifications: boolean;
}
```

---

## Phase 0: Foundation (Types, Migration Script, Compatibility Layer)

**Session estimate:** 3-4 hours
**Dependencies:** None — this is the starting point
**Risk:** Type changes cause cascading compile errors. Mitigated by the compat layer.
**Rollback:** `git stash` or revert commit. No data changes in this phase.
**Test:** `npx tsc --noEmit` passes. App loads. All existing features work unchanged.

### Step 0.1: Create the New Type Definitions

Add these types to `src/lib/types/index.ts`. Do NOT remove existing types yet — the compat layer needs both.

```typescript
// ─── Permission System ─────────────────────────────────────────────────────
export type PermissionFlag = "event_coordinator" | "facility_coordinator" | "checkin_volunteer";

// Update Membership interface — add these fields to the EXISTING Membership:
// event_coordinator: boolean;      (default false)
// facility_coordinator: boolean;   (default false)
// Note: checkin_volunteer already exists on your current Membership

// ─── Unified Person Model ──────────────────────────────────────────────────
// Firestore: churches/{churchId}/people/{personId}

export type PersonType = "adult" | "child";
export type PersonStatus = "active" | "inactive" | "archived";

export interface SchedulingProfile {
  skills: string[];
  max_services_per_month: number;
  blockout_dates: string[];           // ISO date strings, supports ranges "2026-04-01/2026-04-07"
  recurring_unavailable: string[];    // day names: "sunday", "monday", etc.
  preferred_frequency: number;
  max_roles_per_month: number;        // Carried from existing VolunteerAvailability
}

export interface ChildProfile {
  date_of_birth: string | null;
  grade: ChildGrade | null;
  allergies: string | null;
  medical_notes: string | null;
  default_room_id: string | null;
  has_alerts: boolean;
  authorized_pickups: AuthorizedPickup[];
  photo_url: string | null;
}

export interface AuthorizedPickup {
  name: string;
  phone: string | null;
  relationship: string | null;
}

export interface Person {
  id: string;
  church_id: string;
  household_ids: string[];            // Array for blended family support
  person_type: PersonType;

  first_name: string;
  last_name: string;
  preferred_name: string | null;
  name: string;                       // Denormalized "First Last"
  search_name: string;                // Lowercase for prefix queries

  email: string | null;
  phone: string | null;
  search_phones: string[];            // Digits-only for kiosk lookup
  photo_url: string | null;
  status: PersonStatus;

  // Auth linkage
  user_id: string | null;             // Firebase Auth UID
  membership_id: string | null;

  // Volunteer capability flags (top-level for Firestore querying)
  is_volunteer: boolean;
  ministry_ids: string[];
  role_ids: string[];
  campus_ids: string[];

  // Embedded profiles
  scheduling_profile: SchedulingProfile | null;
  child_profile: ChildProfile | null;

  // Volunteer stats (inline for dashboard queries)
  stats: VolunteerStats | null;

  // Existing fields carried forward
  imported_from: ImportSource | null;
  background_check: {
    status: "cleared" | "pending" | "expired" | "not_required";
    expires_at: string | null;
    provider: string | null;
    checked_at: string | null;
  } | null;
  role_constraints: {
    conditional_roles: ConditionalRole[];
    allow_multi_role: boolean;
  } | null;
  volunteer_journey: VolunteerJourneyStep[] | null;

  // QR token (for check-in families — carried from CheckInHousehold)
  qr_token: string | null;

  created_at: string;
  updated_at: string;
}

// ─── Updated Household ─────────────────────────────────────────────────────
// Firestore: churches/{churchId}/households/{householdId}
// NOTE: This REPLACES the existing Household interface (rename old one to LegacyHousehold)

export interface UnifiedHousehold {
  id: string;
  church_id: string;
  name: string;                       // "The Smith Family"
  primary_guardian_id: string | null;  // Person ID of primary contact
  qr_token: string | null;            // Stable QR for fast check-in

  constraints: {
    never_same_service: boolean;
    prefer_same_service: boolean;
    never_same_time: boolean;
  };

  notes: string | null;
  imported_from: "breeze" | "pco" | "generic" | "manual" | null;
  created_at: string;
  updated_at: string;
}

// ─── Scheduling Algorithm Adapter ──────────────────────────────────────────
// Memory-only type — the scheduler consumes this, not raw Person docs

export interface SchedulableVolunteer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  user_id: string | null;
  membership_id: string | null;
  status: PersonStatus;
  ministry_ids: string[];
  role_ids: string[];
  campus_ids: string[];
  household_id: string | null;   // Primary household for constraint checking
  photo_url: string | null;
  availability: {
    blockout_dates: string[];
    recurring_unavailable: string[];
    preferred_frequency: number;
    max_roles_per_month: number;
  };
  stats: VolunteerStats;
  background_check: Person["background_check"];
  role_constraints: Person["role_constraints"];
  volunteer_journey: VolunteerJourneyStep[] | null;
  imported_from: ImportSource | null;
}

// ─── Feature Flags ─────────────────────────────────────────────────────────
// Added to Church interface

export interface FeatureFlags {
  checkin_enabled: boolean;
  rooms_enabled: boolean;
  stage_sync_enabled: boolean;
  service_planning_enabled: boolean;
  max_volunteers: number;           // -1 = unlimited
  max_teams: number;                // -1 = unlimited
  retention_dashboard: boolean;
  background_checks: boolean;
  calendar_feeds: boolean;
  custom_notifications: boolean;
}

// Add to Church interface:
// feature_flags: FeatureFlags;
```

### Step 0.2: Update Membership Interface

Add permission flags to the existing `Membership` interface:

```typescript
// Add these fields to the existing Membership interface:
event_coordinator: boolean;           // default false — access to event management
facility_coordinator: boolean;        // default false — access to room/resource management
// checkin_volunteer already exists — keep it
```

### Step 0.3: Update Church Interface

```typescript
// Add to Church interface:
feature_flags: FeatureFlags;
person_count: number;                 // Denormalized count for tier limit enforcement
```

### Step 0.4: Create Feature Flag Defaults

Create `src/lib/utils/feature-flags.ts`:

```typescript
import type { SubscriptionTier, FeatureFlags } from "@/lib/types";

export function getDefaultFeatureFlags(tier: SubscriptionTier): FeatureFlags {
  switch (tier) {
    case "free":
      return {
        checkin_enabled: false,
        rooms_enabled: false,
        stage_sync_enabled: false,
        service_planning_enabled: false,
        max_volunteers: 15,
        max_teams: 1,
        retention_dashboard: false,
        background_checks: false,
        calendar_feeds: false,
        custom_notifications: false,
      };
    case "starter":
      return {
        checkin_enabled: true,
        rooms_enabled: false,
        stage_sync_enabled: false,
        service_planning_enabled: true,
        max_volunteers: 25,
        max_teams: 3,
        retention_dashboard: false,
        background_checks: false,
        calendar_feeds: true,
        custom_notifications: false,
      };
    case "growth":
      return {
        checkin_enabled: true,
        rooms_enabled: true,
        stage_sync_enabled: false,
        service_planning_enabled: true,
        max_volunteers: 100,
        max_teams: -1,
        retention_dashboard: true,
        background_checks: true,
        calendar_feeds: true,
        custom_notifications: true,
      };
    case "pro":
    case "enterprise":
      return {
        checkin_enabled: true,
        rooms_enabled: true,
        stage_sync_enabled: true,
        service_planning_enabled: true,
        max_volunteers: -1,
        max_teams: -1,
        retention_dashboard: true,
        background_checks: true,
        calendar_feeds: true,
        custom_notifications: true,
      };
  }
}
```

### Step 0.5: Create Permission Utilities

Create `src/lib/auth/permissions.ts`:

```typescript
import type { Membership, Person, PermissionFlag } from "@/lib/types";

export function isGlobalAdmin(membership: Membership): boolean {
  return membership.role === "owner" || membership.role === "admin";
}

export function hasPermission(membership: Membership, permission: PermissionFlag): boolean {
  if (isGlobalAdmin(membership)) return true;
  switch (permission) {
    case "event_coordinator": return membership.event_coordinator === true;
    case "facility_coordinator": return membership.facility_coordinator === true;
    case "checkin_volunteer": return membership.checkin_volunteer === true;
    default: return false;
  }
}

export function canScheduleMinistry(membership: Membership, ministryId: string): boolean {
  if (isGlobalAdmin(membership)) return true;
  if (membership.role !== "scheduler") return false;
  return membership.ministry_scope.length === 0 || membership.ministry_scope.includes(ministryId);
}

export function canManageCheckIn(m: Membership): boolean {
  return hasPermission(m, "checkin_volunteer");
}

export function canManageFacilities(m: Membership): boolean {
  return hasPermission(m, "facility_coordinator");
}

export function canManageEvents(m: Membership): boolean {
  return hasPermission(m, "event_coordinator");
}

export function canViewPerson(membership: Membership, target: Person): boolean {
  if (membership.church_id !== target.church_id) return false;
  if (membership.status !== "active") return false;
  // All active members can view basic person info (directory)
  return true;
}

export function canEditPerson(membership: Membership, target: Person): boolean {
  if (membership.church_id !== target.church_id) return false;
  if (isGlobalAdmin(membership)) return true;

  // Users can edit their own profile
  if (target.person_type === "adult" && target.user_id && target.user_id === membership.user_id) {
    return true;
  }

  // Schedulers can edit volunteers in their scoped ministries
  if (membership.role === "scheduler" && target.is_volunteer) {
    if (membership.ministry_scope.length === 0) return true;
    return target.ministry_ids.some(mid => canScheduleMinistry(membership, mid));
  }

  // Check-in volunteers can edit children's profiles
  if (canManageCheckIn(membership) && target.person_type === "child") {
    return true;
  }

  return false;
}

export function canAccessFeature(
  membership: Membership,
  feature: "scheduling" | "checkin" | "rooms" | "events" | "service_planning" | "stage_sync"
): boolean {
  switch (feature) {
    case "scheduling":
      return isGlobalAdmin(membership) || membership.role === "scheduler";
    case "checkin":
      return isGlobalAdmin(membership) || canManageCheckIn(membership);
    case "rooms":
      return isGlobalAdmin(membership) || canManageFacilities(membership);
    case "events":
      return isGlobalAdmin(membership) || canManageEvents(membership);
    case "service_planning":
      return isGlobalAdmin(membership) || membership.role === "scheduler";
    case "stage_sync":
      return isGlobalAdmin(membership) || membership.role === "scheduler";
    default:
      return false;
  }
}
```

### Step 0.6: Create Compatibility Layer

Create `src/lib/compat/volunteer-compat.ts`:

```typescript
import type { Person, Volunteer, SchedulableVolunteer, VolunteerStats } from "@/lib/types";

const DEFAULT_STATS: VolunteerStats = {
  times_scheduled_last_90d: 0,
  last_served_date: null,
  decline_count: 0,
  no_show_count: 0,
};

/**
 * Convert a Person document (new schema) into the legacy Volunteer shape.
 * Used during migration so existing UI components don't break.
 */
export function personToLegacyVolunteer(p: Person): Volunteer {
  const sp = p.scheduling_profile;
  return {
    id: p.id,
    church_id: p.church_id,
    name: p.name,
    first_name: p.first_name,
    last_name: p.last_name,
    email: p.email ?? "",
    phone: p.phone,
    user_id: p.user_id,
    membership_id: p.membership_id,
    status: p.status === "archived" ? "archived" : p.status === "inactive" ? "inactive" : "active",
    ministry_ids: p.ministry_ids,
    role_ids: p.role_ids,
    campus_ids: p.campus_ids,
    household_id: p.household_ids[0] ?? null,
    photo_url: p.photo_url,
    availability: {
      blockout_dates: sp?.blockout_dates ?? [],
      recurring_unavailable: sp?.recurring_unavailable ?? [],
      preferred_frequency: sp?.preferred_frequency ?? 4,
      max_roles_per_month: sp?.max_roles_per_month ?? 4,
    },
    reminder_preferences: { channels: ["email"] },
    stats: p.stats ?? DEFAULT_STATS,
    imported_from: p.imported_from ?? "manual",
    background_check: p.background_check ?? undefined,
    role_constraints: p.role_constraints ?? undefined,
    volunteer_journey: p.volunteer_journey ?? undefined,
    created_at: p.created_at,
  };
}

/**
 * Convert a Person into the SchedulableVolunteer shape for the scheduling algorithm.
 */
export function personToSchedulable(p: Person): SchedulableVolunteer | null {
  if (!p.is_volunteer || p.status !== "active" || !p.scheduling_profile) return null;
  const sp = p.scheduling_profile;
  return {
    id: p.id,
    name: p.name,
    email: p.email ?? "",
    phone: p.phone,
    user_id: p.user_id,
    membership_id: p.membership_id,
    status: p.status,
    ministry_ids: p.ministry_ids,
    role_ids: p.role_ids,
    campus_ids: p.campus_ids,
    household_id: p.household_ids[0] ?? null,
    photo_url: p.photo_url,
    availability: {
      blockout_dates: sp.blockout_dates,
      recurring_unavailable: sp.recurring_unavailable,
      preferred_frequency: sp.preferred_frequency,
      max_roles_per_month: sp.max_roles_per_month,
    },
    stats: p.stats ?? DEFAULT_STATS,
    background_check: p.background_check,
    role_constraints: p.role_constraints,
    volunteer_journey: p.volunteer_journey,
    imported_from: p.imported_from,
  };
}

/**
 * Convert a legacy Volunteer (old schema) into a Person document shape.
 * Used by the migration script.
 */
export function legacyVolunteerToPerson(
  v: Volunteer,
  householdId: string,
): Omit<Person, "id"> {
  const now = new Date().toISOString();
  const cleanPhone = v.phone?.replace(/\D/g, "");
  return {
    church_id: v.church_id,
    household_ids: [householdId],
    person_type: "adult",
    first_name: v.first_name ?? v.name.split(" ")[0] ?? "",
    last_name: v.last_name ?? v.name.split(" ").slice(1).join(" ") ?? "",
    preferred_name: null,
    name: v.name,
    search_name: v.name.toLowerCase(),
    email: v.email || null,
    phone: v.phone,
    search_phones: cleanPhone ? [cleanPhone] : [],
    photo_url: v.photo_url ?? null,
    status: v.status === "pending" ? "active" : v.status === "archived" ? "archived" : v.status,
    user_id: v.user_id,
    membership_id: v.membership_id,
    is_volunteer: true,
    ministry_ids: v.ministry_ids,
    role_ids: v.role_ids,
    campus_ids: v.campus_ids ?? [],
    scheduling_profile: {
      skills: [],
      max_services_per_month: v.availability.max_roles_per_month,
      blockout_dates: v.availability.blockout_dates,
      recurring_unavailable: v.availability.recurring_unavailable,
      preferred_frequency: v.availability.preferred_frequency,
      max_roles_per_month: v.availability.max_roles_per_month,
    },
    child_profile: null,
    stats: v.stats,
    imported_from: v.imported_from,
    background_check: v.background_check ?? null,
    role_constraints: v.role_constraints ?? null,
    volunteer_journey: v.volunteer_journey ?? null,
    qr_token: null,
    created_at: v.created_at,
    updated_at: now,
  };
}
```

### Step 0.7: Create Migration Script

Create `scripts/migrate-to-unified-people.ts`:

This script should:
1. Read all existing `volunteers` documents
2. Read all existing `checkin_households` documents and their children (from `children` collection)
3. Read all existing `households` documents (scheduling households)
4. Match duplicates by email or phone (digits-only comparison)
5. Create new `people` and `households` (new unified) documents
6. For volunteers that have an existing scheduling `household_id`, merge that household's constraints into the new unified household
7. Create a mapping file `migration-map.json` with `{ oldVolunteerId: newPersonId }` entries
8. Update all `assignments` documents to add `person_id` field (keeping `volunteer_id` for backward compat)
9. Write all changes using batched writes (500 doc limit per batch)
10. Be idempotent: check if `people` collection already has documents before running

**Important implementation detail:** When creating a Person for a volunteer who already has `household_id` pointing to an existing scheduling Household, merge the scheduling household's constraints into the new UnifiedHousehold. The existing scheduling Household's `volunteer_ids` array maps to the new household's member people.

**Run with:** `npx tsx scripts/migrate-to-unified-people.ts --church-id <CHURCH_ID>`

### Step 0.8: Add Composite Indexes

Add to `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "people",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "is_volunteer", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "ministry_ids", "arrayConfig": "CONTAINS" }
      ]
    },
    {
      "collectionGroup": "people",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "person_type", "order": "ASCENDING" },
        { "fieldPath": "search_name", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "people",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "search_phones", "arrayConfig": "CONTAINS" }
      ]
    },
    {
      "collectionGroup": "people",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "household_ids", "arrayConfig": "CONTAINS" }
      ]
    },
    {
      "collectionGroup": "assignments",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "person_id", "order": "ASCENDING" }
      ]
    }
  ]
}
```

Deploy indexes: `firebase deploy --only firestore:indexes`

### Verification (Phase 0)

1. `npx tsc --noEmit` — zero errors
2. App loads normally — no runtime changes, only new files added
3. New type definitions are importable from `@/lib/types`
4. Permission utilities can be imported from `@/lib/auth/permissions`
5. Compat layer can be imported from `@/lib/compat/volunteer-compat`

---

## Phase 1: Data Layer Swap

**Session estimate:** 4-5 hours
**Dependencies:** Phase 0 complete. Migration script has been run against the beta church.
**Risk:** Queries return empty results if collection names are wrong. Mitigated by the compat layer reading from new collections but returning legacy shapes.
**Rollback:** The old collections still exist. Revert the read functions to point at old collection paths.
**Test:** Generate a schedule, do a check-in, view the people list — all work with new data from the `people` collection.

### Step 1.1: Run Migration on Beta Church

Execute the migration script from Step 0.7. Verify the data:
- `people` collection has documents
- `households` (new) collection has documents
- All `assignments` have `person_id` field
- `migration-map.json` exists with correct mappings

### Step 1.2: Create New Data Access Functions

Create `src/lib/api/people.ts`:

```typescript
import { collection, query, where, getDocs, getDoc, doc, orderBy, limit, startAt, endAt } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Person, UnifiedHousehold } from "@/lib/types";

// Scheduling: all active volunteers in a ministry
export async function getVolunteersForMinistry(churchId: string, ministryId: string): Promise<Person[]> {
  const q = query(
    collection(db, "churches", churchId, "people"),
    where("is_volunteer", "==", true),
    where("status", "==", "active"),
    where("ministry_ids", "array-contains", ministryId)
  );
  return (await getDocs(q)).docs.map(d => ({ ...d.data(), id: d.id } as Person));
}

// Scheduling: all active volunteers (no ministry filter)
export async function getAllActiveVolunteers(churchId: string): Promise<Person[]> {
  const q = query(
    collection(db, "churches", churchId, "people"),
    where("is_volunteer", "==", true),
    where("status", "==", "active")
  );
  return (await getDocs(q)).docs.map(d => ({ ...d.data(), id: d.id } as Person));
}

// Check-in kiosk: find family by phone
export async function getFamilyByPhone(churchId: string, rawPhone: string) {
  const searchPhone = rawPhone.replace(/\D/g, "");
  const pQ = query(
    collection(db, "churches", churchId, "people"),
    where("search_phones", "array-contains", searchPhone),
    limit(1)
  );
  const pSnap = await getDocs(pQ);
  if (pSnap.empty) return { household: null, people: [] };

  const foundPerson = pSnap.docs[0].data() as Person;
  const householdId = foundPerson.household_ids[0];
  if (!householdId) return { household: null, people: [foundPerson] };

  // Parallel fetch: all family members + household doc
  const [peopleSnap, hhSnap] = await Promise.all([
    getDocs(query(
      collection(db, "churches", churchId, "people"),
      where("household_ids", "array-contains", householdId)
    )),
    getDoc(doc(db, "churches", churchId, "households", householdId))
  ]);

  return {
    household: hhSnap.exists() ? { ...hhSnap.data(), id: hhSnap.id } as UnifiedHousehold : null,
    people: peopleSnap.docs.map(d => ({ ...d.data(), id: d.id } as Person)),
  };
}

// Check-in kiosk: search by name prefix
export async function getFamilyByName(churchId: string, searchInput: string) {
  const qStr = searchInput.toLowerCase().trim();
  const nameQ = query(
    collection(db, "churches", churchId, "people"),
    where("person_type", "==", "adult"),
    orderBy("search_name"),
    startAt(qStr),
    endAt(qStr + "\uf8ff"),
    limit(10)
  );
  const nameSnap = await getDocs(nameQ);
  if (nameSnap.empty) return [];

  const householdIds = [...new Set(
    nameSnap.docs.flatMap(d => (d.data() as Person).household_ids)
  )];

  // Firestore IN query limit is 30 — safe here since we limit to 10 adults
  if (householdIds.length === 0) return nameSnap.docs.map(d => ({ ...d.data(), id: d.id } as Person));

  const familyQ = query(
    collection(db, "churches", churchId, "people"),
    where("household_ids", "array-contains-any", householdIds.slice(0, 10))
  );
  return (await getDocs(familyQ)).docs.map(d => ({ ...d.data(), id: d.id } as Person));
}

// Admin: all people (with optional filters)
export async function getAllPeople(churchId: string, filters?: {
  type?: "adult" | "child";
  volunteersOnly?: boolean;
  status?: string;
}): Promise<Person[]> {
  let q = query(collection(db, "churches", churchId, "people"));

  if (filters?.type) {
    q = query(q, where("person_type", "==", filters.type));
  }
  if (filters?.volunteersOnly) {
    q = query(q, where("is_volunteer", "==", true));
  }
  if (filters?.status) {
    q = query(q, where("status", "==", filters.status));
  }

  return (await getDocs(q)).docs.map(d => ({ ...d.data(), id: d.id } as Person));
}

// Single person by ID
export async function getPersonById(churchId: string, personId: string): Promise<Person | null> {
  const snap = await getDoc(doc(db, "churches", churchId, "people", personId));
  return snap.exists() ? { ...snap.data(), id: snap.id } as Person : null;
}
```

### Step 1.3: Update Scheduling Algorithm

Update `src/lib/services/scheduler.ts`:

1. Change the import from `Volunteer` to `Volunteer | SchedulableVolunteer`
2. The `generateDraftSchedule` function signature stays the same — it takes `Volunteer[]` — but callers will now pass data transformed through `personToLegacyVolunteer()` OR you can update it to accept `SchedulableVolunteer[]`

**Recommended approach:** Keep the scheduler accepting `Volunteer[]` for now. The calling code (wherever `generateDraftSchedule` is invoked) fetches from the `people` collection, converts via `personToLegacyVolunteer()`, and passes in. This is the least-risk change.

In the assignment output, change `volunteer_id` to write `person_id` as well:

```typescript
// In the DraftAssignment creation (around line 398-412):
const assignment: DraftAssignment = {
  // ... existing fields ...
  volunteer_id: bestVolunteer.id,     // Keep for backward compat
  person_id: bestVolunteer.id,        // NEW: unified reference
  // ...
};
```

### Step 1.4: Update Assignment Queries

Any code that queries assignments by `volunteer_id` should also accept `person_id`:

```typescript
// When reading assignments for a person:
// Try person_id first, fall back to volunteer_id
export async function getAssignmentsForPerson(churchId: string, personId: string) {
  // Query by person_id (new)
  let q = query(
    collection(db, "churches", churchId, "assignments"),
    where("person_id", "==", personId)
  );
  let snap = await getDocs(q);

  // Fallback: query by volunteer_id (legacy)
  if (snap.empty) {
    q = query(
      collection(db, "churches", churchId, "assignments"),
      where("volunteer_id", "==", personId)
    );
    snap = await getDocs(q);
  }

  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}
```

### Step 1.5: Update Check-In to Use People Collection

Update the check-in data layer to use `getFamilyByPhone` and `getFamilyByName` from Step 1.2. The kiosk UI component should receive `Person[]` and filter by `person_type === "child"` to display children.

### Verification (Phase 1)

1. Generate a draft schedule — produces assignments with `person_id` field
2. View the volunteer list — shows all volunteers from `people` collection
3. Check in a family at the kiosk — finds by phone, displays children
4. View a volunteer's assignment history — shows past assignments
5. `npx tsc --noEmit` passes

---

## Phase 2: Permission System & Feature Gating

**Session estimate:** 2-3 hours
**Dependencies:** Phase 1 complete
**Risk:** UI elements disappear for users who should see them. Test with all 4 roles.
**Rollback:** Remove the permission checks from UI components; everything becomes visible again.
**Test:** Log in as scheduler — can only see scoped ministries. Log in as volunteer — sees only their schedule. Admin sees everything.

### Step 2.1: Update Existing Membership Documents

Write a small script or manual Firestore update to add the new permission flags to existing membership documents:

```typescript
// For existing memberships, set defaults:
// event_coordinator: false
// facility_coordinator: false
// (checkin_volunteer already exists)
```

### Step 2.2: Create Feature Gate Component

Create `src/components/FeatureGate.tsx`:

```typescript
"use client";
import { useChurch } from "@/lib/hooks/useChurch"; // or wherever church context lives
import type { FeatureFlags } from "@/lib/types";

interface FeatureGateProps {
  feature: keyof FeatureFlags;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  const { church } = useChurch();
  if (!church?.feature_flags) return fallback;
  const value = church.feature_flags[feature];
  if (typeof value === "boolean" && !value) return fallback;
  if (typeof value === "number" && value === 0) return fallback;
  return <>{children}</>;
}
```

### Step 2.3: Create Permission Gate Component

Create `src/components/PermissionGate.tsx`:

```typescript
"use client";
import { useMembership } from "@/lib/hooks/useMembership";
import { canAccessFeature } from "@/lib/auth/permissions";

interface PermissionGateProps {
  feature: "scheduling" | "checkin" | "rooms" | "events" | "service_planning" | "stage_sync";
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGate({ feature, children, fallback = null }: PermissionGateProps) {
  const { membership } = useMembership();
  if (!membership) return fallback;
  if (!canAccessFeature(membership, feature)) return fallback;
  return <>{children}</>;
}
```

### Step 2.4: Apply Permission Gates to Navigation

Wrap sidebar navigation items with `<PermissionGate>` and `<FeatureGate>` components. See Phase 3 for the full navigation structure.

### Verification (Phase 2)

1. Scheduler role: sees only their scoped ministry teams in sidebar
2. Volunteer role: sees only "My Schedule" and "My Profile"
3. Admin/Owner: sees everything
4. Free tier church: check-in nav item is hidden
5. Growth+ tier: check-in nav item is visible

---

## Phase 3: Navigation Overhaul

**Session estimate:** 3-4 hours
**Dependencies:** Phase 2 complete
**Risk:** Broken routes, dead links. Test every nav item.
**Rollback:** Revert sidebar component to previous version.
**Test:** All routes work. No 404s. Role-appropriate views.

### Sidebar Structure (Admin/Owner View — Full)

Based on PCO's best-in-class navigation with Breeze's simplicity ethos:

```
─── Dashboard (home icon, /)
─── People (users icon, /people)
      └── Directory
      └── Households
      └── Onboarding
─── Teams (layers icon, /teams)
      └── [Ministry Name] (dynamic per ministry)
─── Schedule (calendar icon, /schedule)
      └── Generate
      └── Published
      └── Availability
─── Services (music icon, /services)          [FeatureGate: service_planning]
      └── Plans
      └── Songs
      └── Stage Sync                           [FeatureGate: stage_sync]
─── Check-In (shield-check icon, /checkin)     [FeatureGate: checkin]
      └── Kiosk
      └── Dashboard
      └── Rooms & Labels
─── Events (calendar-days icon, /events)
─── Rooms (door-open icon, /rooms)             [FeatureGate: rooms]
      └── Calendar
      └── Reservations
      └── Signage
─── Reports (bar-chart icon, /reports)
─── Settings (gear icon, /settings)
```

### Scheduler View

Same as Admin but:
- **People** shows only volunteers in their scoped ministries
- **Teams** shows only their scoped ministries
- **Settings** is hidden (except notification preferences)
- **Check-In** visible only if `checkin_volunteer` flag is true

### Volunteer View

```
─── My Schedule (calendar icon, /my-schedule)
─── My Availability (clock icon, /my-availability)
─── Swap Board (arrows-right-left icon, /swaps)
─── Directory (users icon, /directory)        [read-only]
─── My Profile (user icon, /profile)
```

### Mobile Bottom Tab Bar (5 items max)

**Admin:** Dashboard | Schedule | People | Check-In | More (opens remaining items)
**Volunteer:** My Schedule | Availability | Swaps | Directory | Profile

### Pages to Remove/Merge

- Remove any standalone "Volunteers" page — merged into "People > Directory" with filter chips
- Remove standalone "Check-In Households" page — merged into "People > Households"
- Merge "Children" management into "People > Households" household detail view

### Verification (Phase 3)

1. Every sidebar link resolves to a valid page
2. Mobile bottom tab bar works on narrow viewport
3. Role switching (if testable) shows correct nav items
4. No orphaned pages (pages with no nav path to reach them)

---

## Phase 4: Retention Dashboard & Stats

**Session estimate:** 3-4 hours
**Dependencies:** Phase 1 complete (needs people collection with stats)
**Risk:** Stats calculations incorrect. Verify against manual counts.
**Rollback:** Hide the dashboard component; no data loss.
**Test:** Stats match manual verification. Dashboard loads in <2s.

### Step 4.1: Build the Retention Dashboard

This is the core moat feature. Build it as a dedicated page at `/reports/retention` (or as a prominent card on the main Dashboard).

**Metrics to display:**

1. **Serving Frequency by Volunteer** — bar chart showing how many times each volunteer served in the last 90 days. Highlight anyone above their `max_roles_per_month` cap in coral (warning color).

2. **Burnout Risk Indicator** — volunteers who have served 3+ consecutive weeks get a yellow "monitor" badge. 4+ weeks = red "at risk" badge. This is calculated from assignment data, not stored.

3. **Bench Depth** — per ministry/role: how many qualified volunteers exist vs. how many slots need filling each week. A ratio below 2:1 is flagged as "thin bench."

4. **Fairness Score** — the existing `fairnessScore()` function output, displayed as a percentage with a trend line over the last 3 schedule periods.

5. **Decline Rate** — percentage of assignments declined per ministry, with trend.

6. **Volunteer Growth** — new volunteers added in the last 30/60/90 days.

### Step 4.2: Fix Schedule Stats Display

The existing `ScheduleStats` interface and calculation are correct. Ensure:
- `fill_rate` is displayed as a percentage
- `by_status` counts reflect the current assignment statuses (not just the initial draft state)
- Stats recalculate when individual assignments change status

### Step 4.3: Dashboard Consolidation

The main Dashboard (`/`) should show:

**For Admins:**
- This Week's Services card (who's serving, any gaps)
- Retention health summary (green/yellow/red)
- Recent activity feed (assignment changes, swap requests, new signups)
- Quick actions (generate schedule, open kiosk, view reports)

**For Volunteers:**
- Next upcoming assignment card
- "You're serving X times this month" indicator
- Swap requests board
- Quick availability update

### Verification (Phase 4)

1. Retention dashboard loads with real data
2. Burnout indicators correctly flag volunteers with 3+ consecutive weeks
3. Bench depth ratios match manual role/volunteer counts
4. Schedule stats are accurate against assignment data

---

## Phase 5: Integration Prep

**Session estimate:** 2-3 hours
**Dependencies:** Phase 1 complete
**Risk:** External service API changes. Low risk since we're building integration points, not full integrations.
**Rollback:** Remove integration placeholder code; no external dependencies affected.
**Test:** Calendar feed generates valid iCal. Email sends to test address.

### Step 5.1: Calendar Feed Improvements

Ensure the existing calendar feed system works with the new `person_id` field on assignments. The iCal feed should resolve volunteer names from the `people` collection.

### Step 5.2: Email Notification System

Set up Postmark (or Amazon SES) for transactional email:
- Schedule published notifications
- Assignment confirmation requests
- Swap request notifications
- Retention alerts (to admins)

Create `src/lib/services/email.ts` with a unified `sendEmail(to, subject, html, text)` function.

### Step 5.3: Background Check Integration Points

Create the interface for background check integration without implementing a specific provider yet:

```typescript
export interface BackgroundCheckProvider {
  name: string;
  initiateCheck(person: Person): Promise<{ checkId: string; status: "pending" }>;
  getStatus(checkId: string): Promise<{ status: "cleared" | "pending" | "failed"; expiresAt?: string }>;
}
```

Add a "Background Check" section to the Person detail view that shows status and allows manual status updates. The actual Protect My Ministry API integration can be built when the first church requests it.

### Verification (Phase 5)

1. Calendar feed URL returns valid iCal data
2. Test email sends and is received
3. Background check status can be manually set on a Person record

---

## Phase 6: Feedback, Issue Tracking & Product Intelligence System

**Session estimate:** 4-5 hours
**Dependencies:** Phase 0 complete (needs Person/Membership types). Can run in parallel with Phases 2-5.
**Risk:** Low. Self-contained feature with its own collection.
**Rollback:** Remove the feedback UI components; data remains in Firestore.
**Test:** Submit a bug report, a feature request, and an idea from the app. View all three in the admin triage dashboard. Change statuses. Verify email notification fires.

### Why This Is First-Class Infrastructure

This isn't a "feedback form" — it's the operational backbone for running VolunteerCal as a product. It serves three purposes simultaneously:

1. **Support channel** — when something breaks on a Sunday morning or a volunteer can't figure out a workflow, there's a clear, in-app path to report it. No texting Jay directly, no "I'll mention it next Sunday."
2. **Product intelligence** — every pain point, workaround, and "I wish it could..." gets captured, categorized, and preserved. This is the raw material for roadmap decisions.
3. **Scalability foundation** — when you expand to 5, 10, 50 churches, this system becomes your support desk. The structure you build now (statuses, categories, assignment, SLA tracking) scales directly into a multi-church support operation. If you hire help later, they inherit a working system, not a pile of text messages.

### Step 6.1: Feedback Type Definitions

Add to `src/lib/types/index.ts`:

```typescript
// ─── Feedback & Support System ──────────────────────────────────────────────
// Firestore: churches/{churchId}/feedback/{feedbackId}
// Also: global collection feedback-global/{feedbackId} for cross-church admin view

export type FeedbackCategory =
  | "bug"                    // Something is broken
  | "pain_point"             // It works but it's frustrating
  | "feature_request"        // I wish it could do X
  | "idea"                   // Open-ended suggestion
  | "question";              // How do I do X?

export type FeedbackPriority =
  | "critical"               // Blocking Sunday morning operations
  | "high"                   // Significant pain, needs attention this week
  | "medium"                 // Real issue, can wait for next cycle
  | "low"                    // Nice to have, backlog
  | "unset";                 // Not yet triaged

export type FeedbackStatus =
  | "submitted"              // User submitted, not yet seen
  | "acknowledged"           // Admin has seen it, not yet triaged
  | "triaged"                // Categorized and prioritized
  | "in_progress"            // Actively being worked on
  | "resolved"               // Fixed/shipped/answered
  | "wont_do"                // Reviewed and declined (with reason)
  | "duplicate";             // Merged with another item

export type FeedbackDisposition =
  | "ignore"                 // Not actionable
  | "exclude"                // Considered and explicitly rejected
  | "consider"               // Worth exploring, not committed
  | "planned"                // Committed to roadmap
  | "shipped";               // Done

export interface FeedbackItem {
  id: string;
  church_id: string;

  // Submitter
  submitted_by_user_id: string;
  submitted_by_name: string;
  submitted_by_email: string;
  submitted_by_role: OrgRole;

  // Content
  category: FeedbackCategory;
  title: string;                      // Short summary (required)
  description: string;                // Detailed description
  steps_to_reproduce: string | null;  // For bugs
  expected_behavior: string | null;   // For bugs
  screenshot_urls: string[];          // Firebase Storage paths

  // Context (auto-captured)
  page_url: string;                   // Where in the app they were
  user_agent: string;                 // Browser/device info
  app_version: string | null;         // If you version the app

  // Triage (admin-set)
  priority: FeedbackPriority;
  status: FeedbackStatus;
  disposition: FeedbackDisposition | null;
  assigned_to: string | null;         // User ID (future: support team member)
  tags: string[];                     // Freeform tags for grouping: "check-in", "scheduling", "mobile", "sunday-morning"

  // Resolution
  resolution_notes: string | null;    // What was done / why it was declined
  related_feedback_ids: string[];     // For duplicate/related linking
  duplicate_of_id: string | null;     // If status is "duplicate"

  // Tracking
  acknowledged_at: string | null;
  triaged_at: string | null;
  resolved_at: string | null;

  // Admin response visible to submitter
  admin_response: string | null;
  admin_response_at: string | null;

  created_at: string;
  updated_at: string;
}

// ─── Feedback Activity Log ──────────────────────────────────────────────────
// Firestore: churches/{churchId}/feedback/{feedbackId}/activity/{activityId}

export type FeedbackActivityType =
  | "status_change"
  | "priority_change"
  | "category_change"
  | "disposition_change"
  | "comment"
  | "admin_response"
  | "assignment_change"
  | "tag_change"
  | "duplicate_linked";

export interface FeedbackActivity {
  id: string;
  feedback_id: string;
  type: FeedbackActivityType;
  actor_user_id: string;
  actor_name: string;
  previous_value: string | null;
  new_value: string | null;
  comment: string | null;
  created_at: string;
}
```

### Step 6.2: Feedback Submission UI

Create an in-app feedback widget accessible from every page. Two entry points:

**1. Persistent "?" button** (bottom-right corner, above any FAB buttons):
- Floating action button with a help/feedback icon
- Tap opens a bottom sheet (mobile) or modal (desktop)
- Pre-fills `page_url` and `user_agent` automatically

**2. "Report an Issue" in the user menu / settings:**
- Same form, accessible from navigation
- For users who don't notice the floating button

**Submission form fields:**
- **Category** — segmented control: Bug | Pain Point | Feature Request | Idea | Question (required)
- **Title** — single line, required, placeholder varies by category ("What broke?" / "What's frustrating?" / "What would help?" / etc.)
- **Description** — multiline textarea, required, with contextual helper text
- **Steps to Reproduce** — conditional, shows only when category is "bug"
- **Screenshot** — optional file upload (store in Firebase Storage under `feedback/{churchId}/{feedbackId}/`)
- **Priority self-assessment** — optional: "How urgent is this?" (Blocking me right now / Important but not urgent / Just a thought). Maps to initial priority suggestion for triage.

**Post-submission experience:**
- Confirmation with the feedback ID and a "We'll look at this" message
- User can view their submitted feedback items and see status updates
- When admin posts a response, the submitter sees it in their feedback list (and optionally gets an email)

### Step 6.3: Admin Triage Dashboard

Create `/admin/feedback` (admin/owner only) — this is your command center:

**List view with filters:**
- Filter by: status, category, priority, disposition, tags, date range, submitter
- Sort by: newest, oldest, highest priority, most recently updated
- Bulk actions: set priority, set status, add tag, assign

**Card/row for each item shows:**
- Category icon + title
- Submitter name + role + church name (future multi-church)
- Priority badge (color-coded)
- Status badge
- Time since submission
- Tag chips

**Detail view (click into an item):**
- Full submission content including screenshots
- Activity timeline (all status changes, comments, responses)
- Triage controls: set priority, status, disposition, tags, assign
- "Respond to User" field — visible to the submitter, kept separate from internal notes
- "Internal Notes" field — admin-only, not visible to submitter
- "Link as Duplicate" — search and link to existing feedback items
- "Related Items" — manual linking for grouped issues

### Step 6.4: Feedback Analytics & Product Intelligence

Add a `/admin/feedback/insights` view:

**Metrics:**
- Submissions by category over time (are bugs trending down? feature requests up?)
- Average time from submitted → acknowledged → resolved
- Most-tagged areas (which parts of the app generate the most feedback?)
- Open items by priority (the backlog health view)

**Product planning view:**
- All items with disposition "consider" or "planned" — this is your roadmap input
- Group by tag to see clusters: "5 people asked for something related to check-in speed"
- Export capability (CSV or JSON) for synthesis sessions with Claude

### Step 6.5: Notification Integration

When a feedback item is submitted:
- Jay receives an email (from the existing email service, Phase 5) with the title, category, submitter, and a direct link to the triage dashboard
- Critical-priority self-assessments get flagged in the email subject line

When admin responds to feedback:
- Submitter receives an email notification with the response
- Status change to "resolved" triggers a "Your issue has been resolved" notification

### Step 6.6: Sunday Morning Incident Mode

A special consideration for the Sunday morning reality:

Create a **"Sunday Report"** shortcut in the floating feedback button that:
- Pre-sets category to "bug" and priority self-assessment to "Blocking me right now"
- Has a simplified form: just title + description (skip steps to reproduce — they're in the middle of a service)
- Auto-tags with "sunday-morning" and the current date
- Sends an immediate push/email to Jay with "SUNDAY INCIDENT" in the subject

This surfaces the most critical real-time issues in a way that acknowledges the operational context. During the week, these tagged items get a post-mortem review.

### Verification (Phase 6)

1. Submit a bug report from the app — appears in admin triage dashboard
2. Submit a feature request — appears with correct category
3. Change priority and status in admin dashboard — activity log records the changes
4. Post an admin response — submitter can see it in their feedback list
5. Submit a "Sunday Report" — email arrives with SUNDAY INCIDENT flag
6. View insights page — shows submission counts and category breakdown

---

## Priority Sequencing (Anchor Falls First)

Reframed around making your own church experience excellent first, then expanding.

### Ships First (Weeks 1-2): Foundation + Feedback System
- Phase 0 (unified data model types + compat layer)
- Phase 6 Steps 6.1-6.2 (feedback types + submission UI) — **this goes live immediately** so every Sunday interaction from here on generates captured intelligence
- Phase 1 (data layer swap + migration)

### Ships Second (Weeks 3-4): SED Operational Excellence
- Phase 4 (retention dashboard — you need this for your own SED reporting to Pastor Jim)
- Phase 6 Steps 6.3-6.4 (admin triage dashboard + insights — your personal command center)
- Phase 2 (permission system — prep for when other Anchor Falls leaders get accounts)

### Ships Third (Weeks 5-8): Polish for Sunday Mornings
- Phase 3 (navigation overhaul — clean UX for the volunteers who actually use it)
- Phase 6 Steps 6.5-6.6 (notifications + Sunday morning incident mode)
- Phase 5 (calendar feeds + email notifications)

### When Volleyball Winds Down (~Month 3+): SaaS Prep
- Feature gating by tier (needed for pricing enforcement)
- Landing page and positioning work
- Onboard churches #2-5 through pastoral network
- The feedback system you've been running for 2+ months now has real data demonstrating product maturity

### Post-Launch (After 10+ External Churches)
- Tithe.ly giving integration
- Protect My Ministry background check integration
- Retention dashboard as marketing differentiator
- Multi-church admin view for feedback system

---

## Implementation Checklist

Copy this into Claude Code as your starting instruction:

```
## Implementation Checklist — VolunteerCal Unified Person Model

### Phase 0: Foundation
- [ ] Phase 0, Step 1: Add Person, PersonType, PersonStatus, SchedulingProfile, ChildProfile, AuthorizedPickup, UnifiedHousehold, SchedulableVolunteer, and FeatureFlags type definitions to src/lib/types/index.ts (keep existing types, don't remove anything)
- [ ] Phase 0, Step 2: Add event_coordinator: boolean and facility_coordinator: boolean fields to the existing Membership interface in src/lib/types/index.ts
- [ ] Phase 0, Step 3: Add feature_flags: FeatureFlags and person_count: number fields to the existing Church interface in src/lib/types/index.ts
- [ ] Phase 0, Step 4: Create src/lib/utils/feature-flags.ts with getDefaultFeatureFlags(tier) function
- [ ] Phase 0, Step 5: Create src/lib/auth/permissions.ts with isGlobalAdmin, hasPermission, canScheduleMinistry, canManageCheckIn, canManageFacilities, canManageEvents, canViewPerson, canEditPerson, canAccessFeature functions
- [ ] Phase 0, Step 6: Create src/lib/compat/volunteer-compat.ts with personToLegacyVolunteer, personToSchedulable, and legacyVolunteerToPerson functions
- [ ] Phase 0, Step 7: Create scripts/migrate-to-unified-people.ts migration script (idempotent, batched writes, dedup by phone/email, maps old volunteer IDs to new person IDs, updates assignment documents with person_id)
- [ ] Phase 0, Step 8: Add composite indexes to firestore.indexes.json for people collection queries (is_volunteer+status+ministry_ids, person_type+search_name, search_phones, household_ids) and deploy
- [ ] Phase 0, Verify: Run npx tsc --noEmit — zero errors. App loads normally.

### Phase 1: Data Layer Swap
- [ ] Phase 1, Step 1: Run migration script against beta church. Verify people and households collections have correct data.
- [ ] Phase 1, Step 2: Create src/lib/api/people.ts with getVolunteersForMinistry, getAllActiveVolunteers, getFamilyByPhone, getFamilyByName, getAllPeople, getPersonById functions
- [ ] Phase 1, Step 3: Update scheduler.ts to write person_id alongside volunteer_id in DraftAssignment creation
- [ ] Phase 1, Step 4: Update all assignment query functions to read person_id with volunteer_id fallback
- [ ] Phase 1, Step 5: Update the volunteer list page to read from people collection (using personToLegacyVolunteer for minimal UI changes)
- [ ] Phase 1, Step 6: Update check-in kiosk data layer to use getFamilyByPhone and getFamilyByName from people.ts
- [ ] Phase 1, Verify: Generate schedule (produces person_id). Check in a family. View volunteer list. All work.

### Phase 2: Permission System
- [ ] Phase 2, Step 1: Update existing membership documents to include event_coordinator: false and facility_coordinator: false defaults
- [ ] Phase 2, Step 2: Create src/components/FeatureGate.tsx component
- [ ] Phase 2, Step 3: Create src/components/PermissionGate.tsx component
- [ ] Phase 2, Step 4: Wrap navigation items with FeatureGate and PermissionGate components
- [ ] Phase 2, Verify: Scheduler sees scoped view. Volunteer sees minimal nav. Admin sees all.

### Phase 3: Navigation Overhaul
- [ ] Phase 3, Step 1: Restructure sidebar into: Dashboard, People, Teams, Schedule, Services, Check-In, Events, Rooms, Reports, Settings
- [ ] Phase 3, Step 2: Create volunteer-specific nav: My Schedule, My Availability, Swap Board, Directory, My Profile
- [ ] Phase 3, Step 3: Build mobile bottom tab bar (5 items: Dashboard, Schedule, People, Check-In, More)
- [ ] Phase 3, Step 4: Merge "Volunteers" page into "People > Directory" with filter chips (All/Volunteers/Children)
- [ ] Phase 3, Step 5: Merge "Check-In Households" into "People > Households"
- [ ] Phase 3, Verify: All routes work. No dead links. Role-appropriate views.

### Phase 4: Retention Dashboard
- [ ] Phase 4, Step 1: Create /reports/retention page with serving frequency chart, burnout risk indicators, bench depth ratios
- [ ] Phase 4, Step 2: Build burnout risk calculation (3+ consecutive weeks = yellow, 4+ = red)
- [ ] Phase 4, Step 3: Build bench depth per ministry/role (qualified volunteers : weekly slots ratio)
- [ ] Phase 4, Step 4: Add retention health summary card to main Dashboard
- [ ] Phase 4, Step 5: Add volunteer-facing "serving this month" indicator to My Schedule
- [ ] Phase 4, Verify: Dashboard loads with real data. Burnout flags are accurate. Stats match manual count.

### Phase 5: Integration Prep
- [ ] Phase 5, Step 1: Update calendar feed to resolve names from people collection
- [ ] Phase 5, Step 2: Set up email service (Postmark or SES) with sendEmail utility function
- [ ] Phase 5, Step 3: Create BackgroundCheckProvider interface and manual status UI on Person detail
- [ ] Phase 5, Verify: Calendar feed returns valid iCal. Test email sends. Background check status updates.

### Phase 6: Feedback & Support System
- [ ] Phase 6, Step 1: Add FeedbackItem, FeedbackActivity, FeedbackCategory, FeedbackPriority, FeedbackStatus, FeedbackDisposition type definitions to src/lib/types/index.ts
- [ ] Phase 6, Step 2: Create Firestore data access functions for feedback CRUD in src/lib/api/feedback.ts
- [ ] Phase 6, Step 3: Build the floating feedback button component (bottom-right "?" icon, renders on all pages)
- [ ] Phase 6, Step 4: Build the feedback submission form (bottom sheet on mobile, modal on desktop) with category selector, title, description, conditional bug fields, screenshot upload, priority self-assessment
- [ ] Phase 6, Step 5: Build the "My Feedback" view for submitters (list of their submissions with status badges, admin responses visible)
- [ ] Phase 6, Step 6: Build the admin triage dashboard at /admin/feedback (list with filters, bulk actions, card/row per item)
- [ ] Phase 6, Step 7: Build the feedback detail/triage view (full content, activity timeline, priority/status/disposition controls, admin response field, internal notes, duplicate linking)
- [ ] Phase 6, Step 8: Build the "Sunday Report" shortcut mode (simplified form, auto-tags sunday-morning, immediate email notification)
- [ ] Phase 6, Step 9: Build the feedback insights/analytics page at /admin/feedback/insights (submissions by category over time, avg resolution time, most-tagged areas, open items by priority)
- [ ] Phase 6, Step 10: Wire feedback submission and admin response email notifications through the email service (Phase 5)
- [ ] Phase 6, Verify: Submit bug, feature request, and idea. View in admin dashboard. Triage with priority/status changes. Post admin response. Verify submitter sees it. Submit Sunday Report — email arrives flagged.
```
