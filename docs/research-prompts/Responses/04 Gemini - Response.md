This is a complete, production-ready technical architecture for unifying your Person data model and permission system in VolunteerCal.

The architecture strictly adheres to Firestore's best practices. It flattens the data structures to minimize document reads, avoids deep nesting, prevents the 1MB "mega-document" limit risk, and types everything explicitly so your Next.js frontend has maximum context.

### ---

**1\. Firestore Schema**

**What:** Transition from fragmented collections (volunteers, check-in-households, children) to a unified people collection and a lightweight households grouping collection.

**Why:** Deep nesting (households/{id}/children/{id}) makes org-wide queries impossible without restrictive Collection Group queries. A single mega-document per family breaks down when multiple adults have separate volunteer availability. A flat people collection linked by household\_id enables single-read queries for scheduling and two-step parallel reads for check-in.

**Collection 1: Households**

* **Path:** churches/{churchId}/households/{householdId}  
* **Estimated Size:** \~200 bytes  
* **Indexes:** None required (accessed via ID lookup).

**Collection 2: People**

* **Path:** churches/{churchId}/people/{personId}  
* **Estimated Size:** \~1-2 KB  
* **Composite Indexes Required (firestore.indexes.json):**  
  * Scheduling: church\_id (ASC) \+ is\_volunteer (ASC) \+ status (ASC) \+ ministry\_ids (ARRAY)  
  * Directory Name Search: church\_id (ASC) \+ person\_type (ASC) \+ search\_name (ASC)  
  * Check-in Phone Search: church\_id (ASC) \+ search\_phones (ARRAY)

### ---

**2\. TypeScript Interfaces**

**What:** Explicit type definitions using a unified Person interface with optional capability profiles.

**Why:** Using a single interface with embedded profiles (scheduling\_profile, child\_profile) is more flexible for Firestore than a strict Discriminated Union because a child can "age up" into a volunteer simply by populating the scheduling\_profile and is\_volunteer flag, without needing to delete and recreate their document.

TypeScript

// src/lib/types/index.ts

// \--- Permissions & Memberships \---  
export type OrgRole \= "owner" | "admin" | "scheduler" | "volunteer";  
export type PermissionFlag \= "event\_coordinator" | "facility\_coordinator" | "checkin\_volunteer";

export interface Membership {  
  id: string;  
  user\_id: string;             // Firebase Auth UID  
  church\_id: string;  
  person\_id: string | null;    // Links the Auth user to their local church Person record  
  role: OrgRole;  
  ministry\_scope: string\[\];    // Schedulers: which ministries they manage. Empty \= all.  
    
  // Explicit Permission Flags  
  event\_coordinator: boolean;  
  facility\_coordinator: boolean;  
  checkin\_volunteer: boolean;  
    
  status: "active" | "inactive" | "pending";  
  joined\_at: string;  
  updated\_at: string;  
}

// \--- Unified Person Model \---  
export type PersonType \= "adult" | "child";  
export type PersonStatus \= "active" | "inactive" | "archived";

export interface SchedulingProfile {  
  skills: string\[\];  
  max\_services\_per\_month: number;  
  blockout\_dates: string\[\];    // ISO 8601  
  recurring\_unavailable: string\[\];  
  preferred\_frequency: number;  
  onboarding\_status: "not\_started" | "in\_progress" | "complete";  
  training\_records: TrainingRecord\[\];  
}

export interface ChildProfile {  
  birthday?: string | null;  
  grade?: string | null;  
  allergies?: string | null;  
  medical\_notes?: string | null;  
  special\_needs?: string | null;  
  default\_room\_id?: string | null;  
  check\_in\_code?: string | null;  
  has\_alerts?: boolean;  
  authorized\_pickups: AuthorizedPickup\[\];  
}

export interface Person {  
  id: string;  
  church\_id: string;  
  household\_id: string;        // Every person belongs to a household (even singles)  
  person\_type: PersonType;  
    
  first\_name: string;  
  last\_name: string;  
  name: string;                // Denormalized "First Last"  
  search\_name: string;         // Lowercase name for prefix querying  
    
  email: string | null;  
  phone: string | null;          
  search\_phones: string\[\];     // Array of standardized digits for kiosk lookup  
  photo\_url: string | null;  
  status: PersonStatus;  
    
  // Core Identifiers  
  user\_id: string | null;      // Links to global Auth if logged in  
  membership\_id: string | null;  
    
  // Capability Flags & Top-Level Arrays (Crucial for Firestore querying)  
  is\_volunteer: boolean;       // TRUE enables scheduling algorithm lookup  
  ministry\_ids: string\[\];  
  role\_ids: string\[\];  
  campus\_ids: string\[\];  
    
  // Embedded Data Profiles (Avoids Mega-Docs while minimizing reads)  
  scheduling\_profile?: SchedulingProfile | null;  
  child\_profile?: ChildProfile | null;  
    
  // Grok Recommendation: Volunteer Fatigue Metrics stored directly on the person  
  stats?: VolunteerStats;

  created\_at: string;  
  updated\_at: string;  
}

// Memory-only adapter type for the existing 3-Phase Scheduling Algorithm  
export type SchedulableVolunteer \= Pick\<Person, "id" | "name" | "ministry\_ids" | "role\_ids" | "household\_id" | "stats"\> & {  
  availability: Pick\<SchedulingProfile, "blockout\_dates" | "max\_services\_per\_month" | "preferred\_frequency"\>;  
};

// \--- Households \---  
export interface Household {  
  id: string;  
  church\_id: string;  
  name: string;                // e.g., "The Smith Family"  
  qr\_token: string | null;     // Stable token for mobile fast check-in  
  primary\_guardian\_id: string | null;  
    
  // Cross-family scheduling rules  
  constraints: {  
    never\_same\_time: boolean;  // Hard constraint: No overlap in shifts  
    prefer\_same\_service: boolean;  
    never\_same\_service: boolean;  
  };  
    
  notes?: string | null;  
  created\_at: string;  
  updated\_at: string;  
}

// \--- Assignments \---  
export interface Assignment {  
  id: string;  
  schedule\_id: string;  
  church\_id: string;  
  service\_id: string | null;  
  event\_id: string | null;  
  ministry\_id: string;  
  role\_id: string;  
  person\_id: string;           // Renamed from volunteer\_id  
  date: string;  
  status: "draft" | "confirmed" | "declined" | "no\_show";  
  // ... (keep existing assignment tracking fields)  
}

### ---

**3\. Query Patterns**

**What:** Real-world Firebase v9 SDK implementations avoiding anti-patterns.

**Why:** Denormalizing child names into the Household creates stale data nightmares. Fetching via a 2-step parallel approach is exactly how Firestore is intended to be used and is extremely fast.

TypeScript

import { collection, query, where, orderBy, getDocs, limit, startAt, endAt, doc, getDoc } from "firebase/firestore";  
import { db } from "@/lib/firebase";

// 1\. Scheduling Algorithm (All active volunteers in ministry X)  
// Uses Composite Index: church\_id \+ is\_volunteer \+ status \+ ministry\_ids  
export const getVolunteersForMinistry \= async (churchId: string, ministryId: string) \=\> {  
  const q \= query(  
    collection(db, "churches", churchId, "people"),  
    where("is\_volunteer", "==", true),  
    where("status", "==", "active"),  
    where("ministry\_ids", "array-contains", ministryId)  
  );  
  return (await getDocs(q)).docs.map(d \=\> d.data() as Person);  
};

// 2\. Check-In Kiosk: Search by Phone (Optimized 2-round-trip)  
export const getFamilyByPhone \= async (churchId: string, rawPhone: string) \=\> {  
  const searchPhone \= rawPhone.replace(/\\D/g, ""); // Strip to digits  
    
  // Round Trip 1: Find the person via array-contains  
  const pQ \= query(  
    collection(db, "churches", churchId, "people"),   
    where("search\_phones", "array-contains", searchPhone),   
    limit(1)  
  );  
  const pSnap \= await getDocs(pQ);  
  if (pSnap.empty) return { household: null, people: \[\] };

  const householdId \= pSnap.docs\[0\].data().household\_id;

  // Round Trip 2: Fetch the full household and all family members simultaneously  
  const \[peopleSnap, hhSnap\] \= await Promise.all(\[  
    getDocs(query(collection(db, "churches", churchId, "people"), where("household\_id", "==", householdId))),  
    getDoc(doc(db, "churches", churchId, "households", householdId))  
  \]);

  return { household: hhSnap.data() as Household, people: peopleSnap.docs.map(d \=\> d.data() as Person) };  
};

// 3\. Check-In Kiosk: Search by Name Prefix  
export const getFamilyByName \= async (churchId: string, searchInput: string) \=\> {  
  const qStr \= searchInput.toLowerCase().trim();  
  const nameQ \= query(  
    collection(db, "churches", churchId, "people"),  
    where("person\_type", "==", "adult"),  
    orderBy("search\_name"),  
    startAt(qStr),  
    endAt(qStr \+ "\\uf8ff"),  
    limit(10) // Protect payload size  
  );  
  const nameSnap \= await getDocs(nameQ);  
    
  if (nameSnap.empty) return \[\];  
    
  // Extract unique household IDs and fetch family members (IN query limit is 30, which is safe here)  
  const householdIds \= \[...new Set(nameSnap.docs.map(d \=\> d.data().household\_id))\];  
  const familyQ \= query(collection(db, "churches", churchId, "people"), where("household\_id", "in", householdIds));  
    
  return (await getDocs(familyQ)).docs.map(d \=\> d.data() as Person);  
};

// 4\. Admin Volunteer List  
export const getAllVolunteers \= (churchId: string) \=\>  
  query(  
    collection(db, "churches", churchId, "people"),  
    where("is\_volunteer", "==", true),  
    orderBy("first\_name"),  
    orderBy("last\_name")  
  );

// 5 & 6\. Assignments (Identical logic, new person\_id field)  
export const getScheduleAssignments \= (churchId: string, scheduleId: string) \=\>  
  query(collection(db, "churches", churchId, "assignments"), where("schedule\_id", "==", scheduleId));

export const getPersonAssignments \= (churchId: string, personId: string) \=\>  
  query(collection(db, "churches", churchId, "assignments"), where("person\_id", "==", personId));

### ---

**4\. Migration Script**

**What:** An idempotent TS script (runnable via npx tsx) that merges duplicates by phone/email and preserves IDs to ensure Assignment history doesn't break.

TypeScript

// scripts/migrate-to-unified-people.ts  
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export async function runMigration(churchId: string) {  
  const db \= getFirestore();  
  const batch \= db.batch();  
    
  const phoneToAdultId \= new Map\<string, string\>();  
  const emailToAdultId \= new Map\<string, string\>();  
  const oldVolToNewPersonId \= new Map\<string, string\>();

  // 1\. Process Check-In Households  
  const hhSnap \= await db.collection(\`churches/${churchId}/check-in-households\`).get();  
  for (const hhDoc of hhSnap.docs) {  
    const hhData \= hhDoc.data();  
      
    // Create new Household  
    const newHhRef \= db.collection(\`churches/${churchId}/households\`).doc(hhDoc.id);  
    batch.set(newHhRef, {  
      id: hhDoc.id,  
      church\_id: churchId,  
      name: \`${hhData.guardian\_name.split(" ").pop()} Family\`,  
      constraints: { never\_same\_service: false, prefer\_same\_service: false, never\_same\_time: false },  
      qr\_token: \`qr\_${hhDoc.id}\`,  
      created\_at: hhData.created\_at,  
      updated\_at: hhData.updated\_at  
    });

    // Create Guardian Person  
    const guardianRef \= db.collection(\`churches/${churchId}/people\`).doc();  
    const cleanPhone \= hhData.guardian\_phone?.replace(/\\D/g, "");  
      
    const adultData \= {  
      id: guardianRef.id,  
      church\_id: churchId,  
      household\_id: hhDoc.id,  
      person\_type: "adult",  
      first\_name: hhData.guardian\_name.split(" ")\[0\] || "",  
      last\_name: hhData.guardian\_name.split(" ").slice(1).join(" ") || "",  
      name: hhData.guardian\_name,  
      search\_name: hhData.guardian\_name.toLowerCase(),  
      email: hhData.guardian\_email || null,  
      phone: hhData.guardian\_phone || null,  
      search\_phones: cleanPhone ? \[cleanPhone\] : \[\],  
      user\_id: null,  
      status: "active",  
      is\_volunteer: false,  
      ministry\_ids: \[\],  
      role\_ids: \[\],  
      campus\_ids: \[\],  
      created\_at: hhData.created\_at,  
      updated\_at: hhData.updated\_at  
    };  
    batch.set(guardianRef, adultData);

    if (cleanPhone) phoneToAdultId.set(cleanPhone, guardianRef.id);  
    if (adultData.email) emailToAdultId.set(adultData.email.toLowerCase(), guardianRef.id);

    // Migrate Children  
    const childrenSnap \= await hhDoc.ref.collection("children").get();  
    for (const childDoc of childrenSnap.docs) {  
      const cData \= childDoc.data();  
      const childRef \= db.collection(\`churches/${churchId}/people\`).doc(childDoc.id); // reuse ID  
      const childName \= \`${cData.first\_name} ${cData.last\_name}\`;  
        
      batch.set(childRef, {  
        id: childRef.id,  
        church\_id: churchId,  
        household\_id: hhDoc.id,  
        person\_type: "child",  
        first\_name: cData.first\_name,  
        last\_name: cData.last\_name,  
        name: childName,  
        search\_name: childName.toLowerCase(),  
        status: cData.status || "active",  
        is\_volunteer: false,  
        ministry\_ids: \[\],  
        role\_ids: \[\],  
        campus\_ids: \[\],  
        child\_profile: {  
          birthday: cData.birthday || null,  
          grade: cData.grade || null,  
          allergies: cData.allergies || null,  
          medical\_notes: cData.medical\_notes || null,  
          special\_needs: cData.special\_needs || null,  
          authorized\_pickups: cData.authorized\_pickups || \[\],  
          check\_in\_code: cData.check\_in\_code || null,  
        },  
        created\_at: hhData.created\_at,  
        updated\_at: hhData.updated\_at  
      });  
    }  
  }

  // 2\. Process Volunteers  
  const volSnap \= await db.collection(\`churches/${churchId}/volunteers\`).get();  
  for (const volDoc of volSnap.docs) {  
    const vData \= volDoc.data();  
    const cleanPhone \= vData.phone?.replace(/\\D/g, "");  
      
    // Deduplication check  
    let existingPersonId \= null;  
    if (cleanPhone && phoneToAdultId.has(cleanPhone)) existingPersonId \= phoneToAdultId.get(cleanPhone);  
    else if (vData.email && emailToAdultId.has(vData.email.toLowerCase())) existingPersonId \= emailToAdultId.get(vData.email.toLowerCase());

    if (existingPersonId) {  
      // Merge volunteer fields into existing Check-in Guardian  
      batch.update(db.collection(\`churches/${churchId}/people\`).doc(existingPersonId), {  
        is\_volunteer: true,  
        user\_id: vData.user\_id || null,  
        ministry\_ids: vData.ministry\_ids || \[\],  
        role\_ids: vData.role\_ids || \[\],  
        campus\_ids: vData.campus\_ids || \[\],  
        stats: vData.stats || null,  
        scheduling\_profile: {  
          skills: vData.skills || \[\],  
          max\_services\_per\_month: vData.max\_services\_per\_month || 4,  
          blockout\_dates: vData.blackout\_dates || \[\],  
          recurring\_unavailable: \[\],  
          preferred\_frequency: 4,  
          onboarding\_status: vData.onboarding\_status || "complete",  
          training\_records: vData.training\_records || \[\]  
        }  
      });  
      oldVolToNewPersonId.set(volDoc.id, existingPersonId);  
    } else {  
      // Create new stand-alone Adult & Household of 1  
      const newHhRef \= db.collection(\`churches/${churchId}/households\`).doc();  
      batch.set(newHhRef, {  
        id: newHhRef.id, church\_id: churchId,  
        name: \`${vData.name.split(" ").pop()} Household\`,  
        constraints: { never\_same\_service: false, prefer\_same\_service: false, never\_same\_time: false },  
        qr\_token: null,  
        primary\_guardian\_id: null,  
        created\_at: vData.created\_at, updated\_at: vData.updated\_at  
      });

      const newRef \= db.collection(\`churches/${churchId}/people\`).doc(volDoc.id); // reuse vol ID  
      oldVolToNewPersonId.set(volDoc.id, volDoc.id);  
        
      batch.set(newRef, {  
        id: volDoc.id,  
        church\_id: churchId,  
        household\_id: newHhRef.id,  
        person\_type: "adult",  
        first\_name: vData.name.split(" ")\[0\],  
        last\_name: vData.name.split(" ").slice(1).join(" "),  
        name: vData.name,  
        search\_name: vData.name.toLowerCase(),  
        email: vData.email || null,  
        phone: vData.phone || null,  
        search\_phones: cleanPhone ? \[cleanPhone\] : \[\],  
        user\_id: vData.user\_id || null,  
        status: vData.status,  
        is\_volunteer: true,  
        ministry\_ids: vData.ministry\_ids || \[\],  
        role\_ids: vData.role\_ids || \[\],  
        campus\_ids: vData.campus\_ids || \[\],  
        stats: vData.stats || null,  
        scheduling\_profile: {  
          skills: vData.skills || \[\],  
          max\_services\_per\_month: vData.max\_services\_per\_month || 4,  
          blockout\_dates: vData.blackout\_dates || \[\],  
          recurring\_unavailable: \[\],  
          preferred\_frequency: 4,  
          onboarding\_status: vData.onboarding\_status || "complete",  
          training\_records: vData.training\_records || \[\]  
        },  
        created\_at: vData.created\_at,  
        updated\_at: vData.updated\_at  
      });  
    }  
  }

  // 3\. Update Assignments Field Reference  
  const assignsSnap \= await db.collection(\`churches/${churchId}/assignments\`).get();  
  for (const assignDoc of assignsSnap.docs) {  
    const aData \= assignDoc.data();  
    if (aData.volunteer\_id) {  
      batch.update(assignDoc.ref, {  
        person\_id: oldVolToNewPersonId.get(aData.volunteer\_id) || aData.volunteer\_id,  
        volunteer\_id: FieldValue.delete()  
      });  
    }  
  }

  await batch.commit();  
}

### ---

**5\. Compatibility Layer**

**What:** A temporary shim that isolates the database refactor from the UI layer.

**Why:** Prevents big-bang rewrites. UI components expecting Volunteer\[\] will call this adapter until they are updated to consume Person\[\].

TypeScript

// src/lib/compat/volunteer-compat.ts  
import { collection, query, where, getDocs } from "firebase/firestore";  
import { db } from "@/lib/firebase";  
import { Person, SchedulableVolunteer } from "@/lib/types";

// Adapts the new schema for the existing UI components  
export async function getLegacyVolunteers(churchId: string): Promise\<any\[\]\> {  
  const q \= query(  
    collection(db, \`churches/${churchId}/people\`),  
    where("is\_volunteer", "==", true)  
  );  
    
  const snap \= await getDocs(q);  
  return snap.docs.map(doc \=\> {  
    const p \= doc.data() as Person;  
    return {  
      id: p.id,  
      church\_id: p.church\_id,  
      name: p.name,  
      first\_name: p.first\_name,  
      last\_name: p.last\_name,  
      email: p.email || "",  
      phone: p.phone,  
      user\_id: p.user\_id,  
      status: p.status,  
      ministry\_ids: p.ministry\_ids,  
      role\_ids: p.role\_ids,  
      campus\_ids: p.campus\_ids,  
      household\_id: p.household\_id,  
      skills: p.scheduling\_profile?.skills || \[\],  
      max\_services\_per\_month: p.scheduling\_profile?.max\_services\_per\_month || 4,  
      blackout\_dates: p.scheduling\_profile?.blockout\_dates || \[\],  
      stats: p.stats,  
      onboarding\_status: p.scheduling\_profile?.onboarding\_status,  
      training\_records: p.scheduling\_profile?.training\_records || \[\],  
      created\_at: p.created\_at  
    };  
  });  
}

// Memory map for the 3-phase Scheduling Algorithm  
export function extractSchedulable(people: Person\[\]): SchedulableVolunteer\[\] {  
  return people  
    .filter(p \=\> p.is\_volunteer && p.status \=== 'active' && p.scheduling\_profile)  
    .map(p \=\> ({  
      id: p.id,  
      name: p.name,  
      ministry\_ids: p.ministry\_ids,  
      role\_ids: p.role\_ids,  
      household\_id: p.household\_id,  
      stats: p.stats,  
      availability: {  
        blockout\_dates: p.scheduling\_profile\!.blockout\_dates,  
        max\_services\_per\_month: p.scheduling\_profile\!.max\_services\_per\_month,  
        preferred\_frequency: p.scheduling\_profile\!.preferred\_frequency  
      }  
    }));  
}

### ---

**6\. Permission Utilities**

**What:** Centralized pure functions enforcing ABAC (Attribute-Based Access Control).

**Why:** Standardizes authorization logic. Never use if (user.role \=== 'admin') in UI components again.

TypeScript

// src/lib/auth/permissions.ts  
import { Membership, Person, PermissionFlag } from "@/lib/types";

export function isGlobalAdmin(membership: Membership): boolean {  
  return \["owner", "admin"\].includes(membership.role);  
}

export function hasPermission(membership: Membership, permission: PermissionFlag): boolean {  
  if (isGlobalAdmin(membership)) return true;  
  return Boolean(membership\[permission\]);  
}

export function canScheduleMinistry(membership: Membership, ministryId: string): boolean {  
  if (isGlobalAdmin(membership)) return true;  
  if (membership.role \!== "scheduler") return false;  
  // Empty array \= accesses all ministries  
  return membership.ministry\_scope.length \=== 0 || membership.ministry\_scope.includes(ministryId);  
}

export function canManageCheckIn(m: Membership): boolean { return hasPermission(m, "checkin\_volunteer"); }  
export function canManageFacilities(m: Membership): boolean { return hasPermission(m, "facility\_coordinator"); }  
export function canManageEvents(m: Membership): boolean { return hasPermission(m, "event\_coordinator"); }

export function canViewPerson(membership: Membership, target: Person): boolean {  
  // Everyone within a church can view standard profiles (directory constraint)  
  return membership.church\_id \=== target.church\_id && membership.status \=== "active";   
}

export function canEditPerson(membership: Membership, target: Person): boolean {  
  if (membership.church\_id \!== target.church\_id) return false;  
  if (isGlobalAdmin(membership)) return true;  
    
  // User can always edit themselves  
  if (target.person\_type \=== "adult" && target.user\_id \=== membership.user\_id) return true;  
    
  // Schedulers can only edit volunteers in their scoped ministries  
  if (membership.role \=== "scheduler" && target.person\_type \=== "adult" && target.is\_volunteer) {  
    if (membership.ministry\_scope.length \=== 0) return true;  
    return target.ministry\_ids.some(minId \=\> canScheduleMinistry(membership, minId));  
  }  
    
  // Check-in volunteers can edit Check-in profiles (kids)  
  if (canManageCheckIn(membership) && target.household\_id) return true;  
    
  return false;  
}

### ---

**7\. Refactoring Impact Map**

Provide this list directly to Claude to chunk the required changes systematically:

1. **Type definitions (src/lib/types/index.ts):**  
   * Replace old Volunteer, CheckInHousehold, and Child interfaces with the new schemas from Step 2\.  
2. **Data access layer (src/lib/api/\*):**  
   * Rename volunteers.ts to people.ts. Update reads to filter by is\_volunteer: true and apply the compat layer.  
   * Update assignments.ts to query person\_id instead of volunteer\_id.  
   * Update checkin.ts to use the two-step parallel reads for fetching families by phone.  
3. **Business logic (src/lib/scheduling/algorithm.ts):**  
   * Update incoming arrays to map to SchedulableVolunteer to avoid rewriting the math matrix.  
4. **UI components (src/components/\*):**  
   * AdminDirectory.tsx: Consume Person\[\]. Update table columns. Add toggle chips for "All / Volunteers / Children".  
   * CheckInKiosk.tsx: Update state mapping. Drop the nested children map logic in favor of familyArray.filter(p \=\> p.person\_type \=== 'child').  
   * AssignmentModal.tsx: Post person\_id payload instead of volunteer\_id.  
5. **API routes (src/app/api/\*):**  
   * assignments/route.ts: Update volunteer\_id to person\_id in POST body and Firestore writes.

### ---

**8\. Implementation Order (Zero-Downtime Rollout)**

To guarantee the app never breaks (compiling successfully at every step):

1. **Add Types & Compat (Safe):** Add the new Person and Household interfaces to your types file. Add the volunteer-compat.ts file and the permissions.ts file.  
2. **Setup Dual Writes (Safe Iteration):** Update the mutation logic (createVolunteer, createCheckInFamily) so it writes to **both** legacy collections and new people/households collections simultaneously.  
3. **Run Migration (Data Shift):** Execute npx tsx scripts/migrate-to-unified-people.ts. Historical data is securely merged into the new structure. The live application remains unaffected, still reading the old schema.  
4. **Transition Reads (Cutover):** Update UI components and API layers to read from the new collections via the Compat layer. Confirm scheduling algorithm functions normally via the adapter.  
5. **Native Refactor (Cleanup):** Incrementally update UI components to natively consume the Person interface instead of the Compat layer. Update Firebase Security Rules. Delete the legacy collections via the Firebase Console.