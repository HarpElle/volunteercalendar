# VolunteerCal — Scaling & Performance Assessment

_Last updated: March 2026_

## Current Architecture

VolunteerCal uses a **client-side Firestore** architecture. All dashboard pages query Firestore directly from the browser using the Firebase JS SDK. API routes (Next.js) use the Firebase Admin SDK for write-heavy or auth-gated operations (notifications, imports, attendance updates).

### How Data Flows

1. **Page load** → React component mounts → calls `getChurchDocuments(churchId, "collection")` for each subcollection needed (services, events, assignments, ministries, volunteers)
2. **Filtering/sorting** happens client-side after all documents are fetched
3. **Writes** go through API routes (Bearer token auth → Admin SDK → Firestore)
4. **Emails** are sent via Resend from API routes

### Key Characteristics

- **No client-side caching** — every page navigation re-fetches all data
- **Full-collection reads** — dashboard pages load ALL documents in a subcollection, then filter in the browser
- **Per-church isolation** — each church's data is in subcollections under `churches/{id}/`
- **Event signups** are in a top-level `event_signups` collection, queried by `church_id` + `event_id`

---

## Capacity Estimates

These estimates assume the Firestore **Blaze (pay-as-you-go)** plan.

| Metric | Comfortable | Caution Zone | Redesign Needed |
|--------|------------|-------------|-----------------|
| **Active Organizations** | 1–50 | 50–200 | 200+ |
| **People per Org** | 1–200 | 200–500 | 500+ |
| **Services per Org** | 1–20 | 20–50 | 50+ |
| **Events per Org** | 1–30 | 30–100 | 100+ |
| **Concurrent Dashboard Users** | 1–100 | 100–500 | 500+ |
| **Assignments per Org** | 1–2,000 | 2,000–10,000 | 10,000+ |

### Why These Thresholds

**People per Org (200 → 500 → 500+):**
- At 200 volunteers, loading the full volunteer collection takes ~0.5-1s on a good connection. Client-side search/filter works fine.
- At 500 volunteers, the payload approaches 200-400 KB depending on field sizes. Page loads slow noticeably. The People page renders all rows without pagination.
- At 500+, you need server-side pagination and search.

**Events per Org (30 → 100 → 100+):**
- At 30 events, the batch signup query (Phase 20 optimization) fetches all signups in a single Firestore read. Fast.
- At 100 events, the Events tab downloads 100+ event documents plus all their signups. Payload grows.
- At 100+, you need lazy loading (load visible events, fetch more on scroll) and server-side aggregation for counts.

**Active Organizations (50 → 200 → 200+):**
- Firestore free tier: 50K reads/day, 20K writes/day. A single admin dashboard load reads ~5-8 collections. With 50 orgs × a few admins each, daily reads stay under 50K.
- At 200 orgs on Blaze plan, cost is minimal (~$0.06 per 100K reads). But if each org has 20+ events with N+1 patterns, costs multiply.
- At 200+, operational costs warrant caching, denormalization, and monitoring.

**Concurrent Users (100 → 500 → 500+):**
- Firestore auto-scales read capacity. At 100 concurrent users, no issues.
- At 500 concurrent users during a Sunday morning (common pattern for church apps), burst reads could spike. Each user loading their My Schedule page triggers 5-7 reads per org membership.
- At 500+, consider Firestore real-time listeners (snapshot listeners with local caching) instead of one-shot reads.

---

## Firestore Cost Projections

| Scenario | Monthly Reads | Monthly Writes | Estimated Cost |
|----------|-------------|---------------|----------------|
| 10 orgs, 50 people each, light use | ~500K | ~50K | ~$0.50 |
| 50 orgs, 100 people each, moderate use | ~5M | ~500K | ~$5 |
| 200 orgs, 200 people each, active use | ~50M | ~5M | ~$50 |
| 500 orgs, 300 people each, heavy use | ~300M | ~30M | ~$300 |

_Costs are approximate. Actual costs depend on document sizes, query patterns, and regional pricing._

---

## Known Performance Patterns

### Optimized in Phase 20

1. **Event signup batch query** — Replaced N+1 per-event `getEventSignups()` calls with a single `getEventSignupsBatch()` using Firestore `in` operator. Affects scheduling dashboard and Services & Events page.
2. **Parallel data loading** — Short-links API fetch now runs in parallel with event signup loading instead of sequentially.

### Remaining N+1 Patterns

1. **My Schedule page** (`my-schedule/page.tsx`) — Loads 5 collections per organization membership. A user in 3 orgs triggers 15+ Firestore reads. Mitigation: client-side caching.

2. **Attendance API** (`api/attendance/route.ts`) — Reads each assignment/signup document individually before batch-writing attendance updates. Mitigation: use `getAll()` for batch reads.

3. **Invite Batch API** (`api/invite/batch/route.ts`) — Sequential reads per queue item (4-5 reads each). Mitigation: batch-read queue items upfront, then process.

### No Client-Side Caching

Every page navigation re-fetches all data from Firestore. The `firestore.ts` helper functions (`getChurchDocuments`, etc.) have no caching layer. This means:
- Switching between dashboard tabs re-reads everything
- Navigating away and back re-reads everything
- Multiple components on the same page may query the same collection independently

---

## Optimization Roadmap

### Near-Term (Recommended for Phase 22-23)

**1. Client-Side Query Cache**
Add a simple Map-based cache with TTL (60 seconds) to `getChurchDocuments`. Most subcollection data changes infrequently during a session. This alone would cut Firestore reads by 50-70% during normal dashboard use.

```
Cache key: `${churchId}/${collection}`
TTL: 60 seconds
Invalidation: on write operations to the same collection
```

**2. Pagination for Large Collections**
Add `limit()` + cursor-based pagination to:
- Volunteers list (People page) — currently loads all
- Events list (Services & Events page) — currently loads all
- Assignment history (My Schedule past tab) — currently loads all

**3. Denormalize Signup Counts**
Write `active_signup_count` onto Event documents via a Cloud Function trigger on the `event_signups` collection. This eliminates the need to query signups just to show counts on event cards.

**4. Server-Side API Routes for Heavy Reads**
Move the scheduling dashboard's multi-collection load to a single API route that uses the Admin SDK. Benefits:
- Single HTTP round-trip instead of 5-8 parallel Firestore reads from the client
- Admin SDK has no per-user rate limits
- Can implement server-side caching (in-memory or Redis)

### Medium-Term (At 100+ Organizations)

**5. Firestore COUNT Aggregation**
Use `getCountFromServer()` for stats that only need counts, not full documents (e.g., "Active Volunteers" stat on the dashboard).

**6. Compound Indexes for Server-Side Sorting**
Add composite indexes for common query patterns (e.g., assignments by `service_date` + `ministry_id`) to enable server-side ordering and avoid loading all documents for client-side sort.

**7. Batch Reads in API Routes**
Replace sequential `adminDb.doc(...).get()` loops in attendance and invite APIs with `adminDb.getAll()` batch reads.

**8. Real-Time Listeners for Live Data**
For pages that stay open (scheduling dashboard during a service), use Firestore `onSnapshot` listeners instead of one-shot reads. This provides:
- Automatic local caching (Firestore SDK caches snapshot data)
- Real-time updates without polling
- Reduced read costs (subsequent updates only transfer changed documents)

### Long-Term (At 500+ Organizations)

**9. CDN/Edge Caching for Public Pages**
Public event pages (`/events/[churchId]/[eventId]`) and join pages could be statically generated or edge-cached. These pages are read-heavy with low write frequency.

**10. Sharded Counters**
For high-traffic events (hundreds of signups per minute), a single Event document's `active_signup_count` field would hit Firestore's 1 write/sec/doc limit. Use distributed counters.

**11. Consider Hybrid Database Architecture**
Keep Firestore for real-time features (live roster views, instant notifications) but add a SQL database (PostgreSQL via Supabase or PlanetScale) for:
- Reporting and analytics dashboards
- Complex queries (cross-org stats, historical trends)
- Full-text search on volunteer names/emails

**12. Background Job Processing**
Move email sending, import processing, and notification dispatch to a background job queue (Cloud Tasks or Cloud Functions) to avoid blocking API response times.

---

## Monitoring Recommendations

To track when you're approaching capacity thresholds:

1. **Firestore Console** — Monitor daily read/write counts and storage usage
2. **Vercel Analytics** — Track API route response times; set alerts for p95 > 2s
3. **Custom Metrics** — Log collection sizes per church (volunteer count, event count) to identify large tenants early
4. **Cost Alerts** — Set Google Cloud billing alerts at $10, $50, $100 monthly thresholds

---

## Summary

VolunteerCal's current architecture comfortably supports **50 organizations with up to 200 people each**. The Phase 20 batch query optimization addresses the most impactful bottleneck (event signup loading). For growth beyond 50 orgs, prioritize client-side caching and pagination. For growth beyond 200 orgs, invest in server-side aggregation, denormalization, and monitoring.

The system's per-church data isolation (Firestore subcollections) is a strong foundation — each org's data is naturally partitioned, which means scaling challenges are per-tenant rather than system-wide. A single large church (500+ volunteers, 100+ events) would feel performance issues before the platform as a whole does.
