# VolunteerCal Expansion Specification
## Service Planning, Worship, and Scheduling Modes Evolution

**Version:** 1.0  
**Date:** March 21, 2026  
**Purpose:** Technical and functional specification for expanding VolunteerCal from scheduling-only to a full church operations platform covering scheduling, worship planning, and Music-Stand-style stage collaboration.

---

## Executive Summary

VolunteerCal will evolve to become the **premier volunteer and worship scheduling platform for churches**, positioning itself as a replacement for Planning Center Online (Services + Music Stand) without the full-ChMS baggage that prices out small-to-medium churches.

### Core Strategy

- **Phase 1 (Immediate):** Enhance scheduling flexibility with perpetual service profiles, effective-date change tracking, occasional teams, and activate multiple workflow modes (team-first, centralized, hybrid).
- **Phase 2 (Growth):** Introduce worship planning module: song library, service plans, SongSelect integration, and web-based stage collaboration ("Stage Sync").
- **Phase 3 (Pro):** Add CCLI reporting (manual and auto), ProPresenter integration, and advanced analytics.

### Positioning

- **For Small-Medium Churches:** "Best-in-class scheduling with worship planning that actually fits your budget and complexity."
- **For Scaling Churches:** "Grow from team-owned scheduling into coordinated master-roster workflows with one tool."
- **Pricing:** Core scheduling remains at Starter/Growth/Pro tiers. Worship add-on (SongSelect, Stage Sync, CCLI auto-report, ProPresenter) available on Growth+ and as standalone add-on.

---

## Part 1: Service Profiles and Timeline Changes

### 1.1 Current State

Services are stored as persistent documents with recurrence rules but are often thought of as "templates" before being expanded into individual occurrences during schedule generation.

### 1.2 Desired State

**Perpetual Service Profiles with Timeline-Based Changes:**

Each service maintains a "standing" profile (name, base time, recurrence) and a list of **ministries**, each with:
- `ministry_id`, `role_ids` (which roles from that ministry serve), and optional per-ministry time overrides.
- `is_default` flag: when true, this ministry is always included in new schedules; when false, it's optional-per-occurrence.
- `effective_from` and `effective_until` dates: allow ministry structure to change on a specific date forward.

When an admin/scheduler edits a service, the system prompts:
> **"When should this change take effect?"**
> - [ ] From next occurrence
> - [ ] From [date picker] forward
> - [ ] Only on [specific date(s)] (one-off override)

### 1.3 Occasional/Ad-Hoc Teams

Add a new category of ministry participation within the service profile:

- **Default teams** ("Worship", "Tech", "Greeters") are always present.
- **Occasional teams** ("Communion", "Baptism", "Special Music") can be toggled per service date.

In the schedule builder UI, schedulers see two sections:
1. **Default teams** (automatically populated from the profile).
2. **Add optional teams** (checkboxes for occasional ministries).

When an optional team is added to a service date:
- Role slots are created only for that date.
- The service profile remains unchanged.
- Example: add "Communion Team" to the first Sunday of each month without changing the base profile.

### 1.4 Implementation Details

**Data Model Changes:**

```
Service {
  // existing
  id, name, recurrence_pattern, day_of_week, start_time, end_time, campus_id, ...

  // new
  ministry_assignments: [
    {
      ministry_id: string,
      role_ids: [string],
      per_role_time_overrides?: { role_id -> { start_time, end_time } },
      is_default: boolean,
      effective_from: ISO date string,
      effective_until: ISO date string (nullable),
      created_at, updated_by, ...
    }
  ],
  
  change_history: [
    {
      change_type: 'ministry_added' | 'ministry_removed' | 'role_modified' | 'time_changed',
      effective_from: ISO date,
      previous_value: object,
      new_value: object,
      changed_by: user_id,
      changed_at: timestamp
    }
  ]
}
```

**API Changes:**

- `PATCH /api/services/{id}` accepts a new field: `effective_from_date` and `edit_scope` ('next' | 'from_date' | 'single_date').
- When changing ministry structure, the system:
  1. Validates the effective date against published schedules (warn if schedules exist after the date).
  2. Creates a change history entry.
  3. Does NOT retroactively modify existing assignments; only future schedule generation respects the new structure.
  4. Returns the list of currently-published schedules affected (for admin awareness).

**UI Changes:**

- Service detail form: add "Service Timeline" section showing past and future ministry changes.
- Edit dialog includes "effective from" picker and confirmation gate.
- Schedule builder: show which ministries are "default" (visually distinct) and which are optional checkboxes.

### 1.5 Validation and Conflict Handling

- If an admin removes an always-on ministry from a service (e.g., unchecks "Communion" for a specific occurrence):
  - System checks if anyone is scheduled for that ministry on that date.
  - If yes, displays a warning: "2 volunteers are scheduled for Communion on 3/29. Removing this team will unassign them. Continue?"
  - If admin confirms, those volunteers receive a notification: "You were scheduled for Communion on [date], but the team is no longer needed. Thank you!"
  - Assignment records are marked `status: cancelled` (not deleted); audit trail preserved.

---

## Part 2: Scheduling Workflow Modes

### 2.1 Current State

Only `centralized` mode is active. All scheduling happens via a central scheduler creating one global schedule per period, then ministry leads approve.

### 2.2 Desired State

Activate **three workflow modes**, selectable per org:

#### Mode A: Team-First (Independent)

- Each ministry leader schedules their own team on their own timeline.
- Schedulers see only their team's view; other team schedules are invisible unless they navigate to a "master view."
- Volunteers may be scheduled independently by multiple teams (no coordination of multi-team conflicts).
- **Use case:** Smaller churches or those with fully decentralized, autonomous ministry structures.
- **Activation:** Default for new orgs or orgs with 1-2 ministries.

#### Mode B: Centralized (Master Roster)

- Central admin/scheduler orchestrates all scheduling for a period.
- Single publish wave sends all assignments at once.
- Volunteers get one coordinated set of requests instead of multiple uncoordinated ones.
- **Use case:** Growing churches that want fairness, conflict resolution, and a single confirmation flow.
- **Activation:** Recommended for orgs crossing 100 volunteers or 5+ ministries.

#### Mode C: Hybrid (Recommended)

- Central admin runs quarterly master schedule with availability window and global fairness.
- Ministry leaders retain local refinement and approval authority over their slice.
- Shared volunteers can be coordinated across team leaders during the review phase.
- **Use case:** Most mid-size churches; combines autonomy with coordination.
- **Activation:** Default after initial setup is complete.

### 2.3 Availability Window and Reminders

**New Feature: Availability Window Campaign**

When an admin initiates a schedule period in Centralized or Hybrid mode:

1. **Announcement:**
   - Admin creates a "Schedule Period" with:
     - Coverage period: [start date] to [end date].
     - Availability due date: [date before scheduling run].
     - Optional message to volunteers.
   - System generates and sends an email to all active volunteers:
     > "Help us plan ahead! Please update your availability for [coverage period] by [due date] so we can create a fair, balanced schedule. [Link to availability form]"

2. **Login Reminder:**
   - Volunteers who log in before the due date see a banner: "Update your availability for [coverage period]. Due by [date]."
   - Banner includes a direct link to the availability form.

3. **Team Leader Nudge (Optional):**
   - Ministry leads receive an email: "[N] volunteers in your team haven't updated availability yet. [Link to view + send reminder]"

4. **Tracking:**
   - Dashboard displays: "Availability Response: [X]% of volunteers have updated."

### 2.4 Master Roster Generation and Multi-Stage Approval

**The Centralized/Hybrid Workflow:**

1. **Draft Generation:**
   - Admin clicks "Generate Master Schedule" → selects period, runs auto-scheduler with fairness constraints (household, availability, frequency caps, etc.).[file:44]
   - System produces a draft with assignments across all ministries and a conflict summary.

2. **Ministry-Level Review (Approval Gate):**
   - Workflow status: `draft`.
   - Each ministry lead sees their team's assignments in a dedicated view.
   - Can refine: add/remove/swap volunteers, note conflicts, flag issues.
   - Can coordinate with other team leads inside VolunteerCal: "I need to swap Sarah with the Tech team to cover both Worship and Tech on 4/5. Can we coordinate?"
   - Approval UI includes: target due date (e.g., "Review by Friday EOD") and a countdown timer.
   - Once all ministry leads approve, workflow status changes to `approved`.

3. **Early Approval (Optional):**
   - If all teams approve before the due date, admin can click "Publish Now" without waiting for the deadline.
   - Broadcast confirmation emails immediately.

4. **Publish:**
   - Workflow status: `published`.
   - Single wave of confirmation emails to all assigned volunteers.
   - Volunteers confirm/decline; auto-reschedule on declines if enabled.

### 2.5 Implementation Details

**Data Model Changes:**

```
Schedule {
  // existing fields (id, church_id, start_date, end_date, created_by, etc.)

  // new/changed
  workflow_mode: 'team_first' | 'centralized' | 'hybrid',
  
  availability_window?: {
    due_date: ISO date,
    message?: string,
    reminder_sent_at: timestamp (nullable),
    response_count: integer (denormalized for dashboard),
  },
  
  approval_workflow?: {
    status: 'draft' | 'pending_approval' | 'approved' | 'published' | 'archived',
    target_approval_date?: ISO date,
    started_at: timestamp,
    approved_at?: timestamp,
    published_at?: timestamp,
    ministry_approvals: {
      [ministry_id]: {
        approved: boolean,
        approved_by: user_id,
        approved_at?: timestamp,
        notes?: string
      }
    },
    conflict_summary?: {
      total_conflicts: integer,
      unfilled_slots: [{ role_id, count }],
      household_conflicts: [{ volunteer_ids, reason }],
      other_flags: string[]
    }
  },
  
  meta: {
    fairness_score: number,
    fill_rate: number,
    confirmation_rate?: number
  }
}
```

**API Changes:**

- `POST /api/schedules` now accepts `workflow_mode` and `availability_window`.
- `POST /api/schedules/{id}/availability-window` sends broadcast reminder.
- `PATCH /api/schedules/{id}/approve` marks ministry as approved (requires ministry lead role).
- `PATCH /api/schedules/{id}/publish` transitions to published and broadcasts confirmations.
- `GET /api/schedules/{id}/coordination` provides a view for multi-team coordination (shared volunteers, potential conflicts).

**UI Changes:**

- **Schedule Setup Wizard:**
  - Step 1: Pick workflow mode (radio buttons with descriptions).
  - Step 2: Pick coverage period and availability due date.
  - Step 3: Auto-generate or start with template.
  - Step 4: Review conflicts and ministry assignments.

- **Ministry Review Dashboard:**
  - Shows only the current ministry's assignments.
  - Filter/sort by role, date, conflict status.
  - Inline edit (swap, add, remove) with confirmation gates.
  - "Coordinate with other teams" button opens a modal showing which other teams have shared volunteers on overlapping dates.

- **Main Schedule Dashboard:**
  - Shows workflow status, approval progress (X/Y teams approved), and "Publish Now" button (enabled when all teams approved).
  - If any team hasn't approved and deadline is approaching, displays countdown and "Send Reminder" button.

### 2.6 Validation and Conflict Detection

- During ministry review, if a leader tries to remove a volunteer from a role where they're pinned or from a household constraint, flag it in a side panel.
- When publishing, validate: all ministry approvals done, no unfilled critical roles (warning, not blocker), confirmation count (just for visibility).

---

## Part 3: Household Scheduling Preferences

### 3.1 Current State

Household objects exist in the data model with `never_same_service` and `prefer_same_service` constraints, but there is **no UI to create or manage households**.[file:44]

### 3.2 Desired State

**Household Management UI:**

1. **Household Creation/Editing:**
   - People page → "Families" tab (or collapsible section).
   - Admin creates a family group by adding family members (multiselect from existing volunteers).
   - Set preferences:
     - [ ] Serve together when possible (soft preference for auto-scheduler).
     - [ ] Never serve in the same service (hard constraint; scheduler skips one member if the other is assigned).
     - [ ] Never serve at the same time (hard constraint; applies to same-date roles, even if different services).
   - Optional fields: family name, notes (e.g., "One vehicle, must coordinate").

2. **Household View in Schedules:**
   - When reviewing a schedule, admin can filter by "Family name" or see a "Households" card on the dashboard showing how each family is distributed across upcoming dates.
   - Example: "The Smiths: John (Worship 4/5), Sarah (Tech 4/5) — conflicts with 'never same service' preference."

3. **Volunteer Profile Integration:**
   - On a volunteer's profile, show their household membership: "Part of Smith Family — preference: never same service."
   - Button to view or edit household details (admin only).

4. **Notifications:**
   - When a schedule is published, and a household constraint is violated, send the family a note:
     > "Your family is scheduled for the same service on [date]. We know you prefer to never serve at the same time. We'll work on adjusting this in the next schedule."

### 3.3 Implementation Details

**Data Model (Already Exists, Needs UI):**

```
Household {
  id, church_id,
  name?: string (e.g., "Smith Family"),
  volunteer_ids: [string],
  constraints: {
    never_same_service: boolean,
    prefer_same_service: boolean,
    never_same_time: boolean
  },
  notes?: string,
  created_at, updated_by
}
```

**UI Changes:**

- Add "Households / Families" tab to People page.
- Household card: list members, show preferences, edit/delete buttons.
- Add family, modal pops with:
  - Search + multiselect for volunteers.
  - Checkboxes for preferences.
  - Save/Cancel.
- In schedule conflicts panel, call out household violations explicitly.

---

## Part 4: Song Library and Worship Planning Module

### 4.1 Overview

The Worship module covers song management, service planning, and stage collaboration. It is marketed as an add-on for Growth, Pro, and Enterprise tiers (or available standalone).

### 4.2 Song Library

**Data Model:**

```
Song {
  id, church_id,
  
  // Metadata
  title: string,
  ccli_number?: string,
  ccli_publisher?: string,
  
  // Keys and arrangements
  default_key?: string,
  available_keys?: [string],
  artist_credit?: string,
  writer_credit?: string,
  copyright?: string,
  
  // Organization and rotation
  tags: [string] (e.g., "Worship", "Fast", "Minor Key", "Rotation: Spring 2026"),
  in_rotation: boolean,
  rotation_lists?: [string] (e.g., "Sunday AM", "Youth Group"),
  
  // Resources
  lyric_source: 'manual' | 'songselectlead' | 'genius' | 'ccli' | 'other' (nullable),
  lyrics?: string,
  chord_chart_url?: string,
  sheet_music_url?: string,
  media_file_url?: string,
  propresenter_document_id?: string,
  
  // Lifecycle
  date_added: ISO date,
  last_used_date?: ISO date,
  use_count: integer (denormalized),
  status: 'active' | 'archived' | 'retired',
  notes?: string,
  
  created_at, updated_by
}
```

**UI:**

- Song Library page (`/dashboard/worship/songs`):
  - Table: title, key, artist, tags, last used, use count, status.
  - Filters: tag, rotation status, date range, CCLI number.
  - Add Song button → modal with form.
  - Bulk import from SongSelect (see §4.4).
  - Bulk actions: add tag, archive, change rotation status.

- Song Detail:
  - Edit metadata, tags, rotation status.
  - View/edit lyrics, chord chart, attachments.
  - Usage history: "Last used [date], used [X] times in past 90 days."
  - Quick add to current/next service plan.

### 4.3 Service Plans (Order of Service)

**Data Model:**

```
ServicePlan {
  id, church_id,
  service_id: string, // reference to recurring service
  service_date: ISO date,
  
  // Metadata
  theme?: string,
  speaker?: string,
  scripture_references?: [string],
  notes?: string,
  
  // Items (order of service)
  items: [
    {
      id, // unique within this plan
      sequence: integer,
      type: 'song' | 'prayer' | 'announcement' | 'sermon' | 'offering' | 'video' | 'custom',
      
      // For songs
      song_id?: string (reference to Song),
      key?: string (override default),
      duration_minutes?: integer,
      arrangement_notes?: string,
      
      // For other types
      title?: string,
      duration_minutes?: integer,
      notes?: string,
      
      // Visibility
      include_in_program_notes: boolean,
      
      created_at, updated_by
    }
  ],
  
  // Publishing and sync
  published: boolean,
  published_at?: timestamp,
  synced_to_propresenter?: boolean,
  propresenter_sync_at?: timestamp,
  
  created_at, updated_by
}
```

**UI:**

- Service Plan Editor (`/dashboard/worship/plans/{date}`):
  - Shows service metadata (date, service name, ministries, volunteers).
  - Drag-and-drop order-of-service builder.
  - Add Item modal:
    - Pick type (song, prayer, etc.).
    - For songs: search and select from Song Library, show CCLI number, default key, and override key.
    - For other types: enter title, duration, notes.
  - Each item shows: sequence, type, title, duration, key (if song).
  - Buttons per item: edit, duplicate, move, remove.
  - Publish button: freezes the plan, triggers stage-sync updates (see §4.5).

- Service Plan List (`/dashboard/worship/services`):
  - Calendar or list view of upcoming service dates.
  - Shows which have plans, which are published.
  - Quick actions: create, edit, publish, preview.

### 4.4 SongSelect Integration

**Overview:**

Churches with a SongSelect subscription (bundled with CCLI) can import songs directly into their VolunteerCal library.

**Implementation:**

1. **Authentication:**
   - Org Settings → Worship tab.
   - Admin enters SongSelect credentials (email + password, or API key if SongSelect exposes it).
   - Credentials are encrypted and stored per org.
   - Test connection button to validate.

2. **Import Flow:**
   - Song Library → "Import from SongSelect" button.
   - Modal: search SongSelect catalog.
   - Select songs, review metadata, confirm import.
   - System pulls title, artist, CCLI number, lyrics, chord charts (if available).
   - Imported songs are marked `lyric_source: 'songselectlead'`.

3. **Ongoing Sync:**
   - Optional toggle: "Keep SongSelect charts updated."
   - If enabled, weekly job checks if imported songs have updated charts and re-pulls them.

**API and Integrations:**

- Use SongSelect's public API or web scraping (depending on SongSelect's ToS).
- Store SongSelect song IDs to enable re-sync.
- Error handling: if a song is removed from SongSelect, flag it in the UI but keep the local copy.

### 4.5 Stage Sync: Real-Time Order-of-Service Collaboration

**Overview:**

"Stage Sync" is a real-time, web-based order-of-service viewer for worship teams, tech operators, and media. It replaces Music Stand's core functionality for your use case: shared, synchronized view of the current item in the service plan.

**Architecture:**

- **Conductor Device** (usually worship leader's iPad):
  - Shows full run sheet with all items, sequencing controls.
  - "Next" button advances to the next item.
  - Changes are pushed to Firestore in real-time.

- **Participant Devices** (musicians, tech ops, media):
  - Open a simple URL per service (public, token-protected).
  - Subscribe to the current ServicePlan in Firestore.
  - When conductor advances, all devices update simultaneously.
  - Show only the current item (song, prayer, etc.) with large, legible formatting.

- **Song Chart View:**
  - For song items, display lyrics and/or chord chart in the current key.
  - Large font optimized for iPad/tablet viewing.
  - Swipe or arrow-key navigation to view multiple pages of a chart (if it spans multiple screens).

**Data Model Changes:**

```
ServicePlan {
  // ... existing fields ...
  
  stage_sync?: {
    enabled: boolean,
    current_item_id?: string (reference to items[].id),
    current_item_index?: integer,
    conductor_user_id?: string,
    last_advanced_at?: timestamp,
    access_token: string (unique, for public/unauthenticated access),
    viewers_connected: integer (denormalized)
  }
}
```

**UI:**

- **Conductor View** (`/stage-sync/conductor/{church_id}/{plan_id}?token={token}`):
  - Full-screen run sheet.
  - Large "NEXT" button (or space/enter key) to advance.
  - Current item highlighted in bright color.
  - Shows connected participant count: "3 devices connected."
  - Back button or escape to exit.

- **Participant View** (`/stage-sync/view/{church_id}/{plan_id}?token={token}`):
  - Full-screen, single item view.
  - For songs: large lyrics/chord chart, current key displayed.
  - For other items: title and notes in large font.
  - Subtle indicator when advancing happens: item changes with a smooth transition.
  - No controls; passive view only.

- **Church Settings:**
  - Worship tab → "Stage Sync Settings."
  - Enable/disable per service plan at publish time.
  - Generate shareable links: copy URL or QR code.
  - Option to require PIN or email-based access.

**Implementation:**

- Use Firestore real-time listeners (`onSnapshot()`) for conductor and participant devices to stay in sync.
- Conductor publishes updates to `ServicePlan.stage_sync.current_item_id` and `current_item_index`.
- Participants react to changes and re-render.
- Store access tokens in a separate `stage_sync_sessions` collection to allow expiration and revocation.

**Key UX Principles:**

- **Dead-simple for volunteers:** Email or text with a link, they click it, they see the plan. No login required (token-protected).
- **Minimal latency:** Real-time Firestore listeners ensure <500ms sync across devices on same WiFi.
- **Robust for monthly volunteers:** Works across multiple devices, doesn't require app download, persists if WiFi drops briefly.

### 4.6 Song Usage Reporting

**Overview:**

Generate reports of which songs were used in services over a date range, including use counts, CCLI numbers, and rotation/tag data. Supports both internal review and CCLI reporting compliance.

**Data Model:**

```
SongUsageRecord {
  id,
  church_id,
  song_id,
  service_plan_id,
  service_date: ISO date,
  service_name: string,
  song_title: string,
  ccli_number?: string,
  key_used?: string,
  created_at: timestamp
}
```

**UI:**

- Reports page (`/dashboard/worship/reports/song-usage`):
  - Filters: date range, rotation/tags, service name.
  - Table: song title, CCLI #, date used, service, key, tag, use count in range.
  - Export buttons: CSV, PDF, email.
  - Summary stats: total songs used, total uses, most/least used songs.

- **Manual Reports:**
  - "Generate Report" button → date range picker → downloads CSV.
  - CSV format: Song Title, CCLI Number, Service Name, Date, Key, Count.

- **For CCLI:**
  - Column: "Include in CCLI Report?" (checkbox per row).
  - "Export to CCLI" button generates CCLI-formatted CSV (or direct API submission if integrated later).

### 4.7 Song Rotation and Curation

**Feature:**

Support your worship leader's practice of curating and rotating songs in/out.

**UI:**

- Song Library page → "Rotation" tab.
- View active rotation lists (e.g., "Sunday AM Rotation - Spring 2026").
- Create new rotation list: name, date range, description.
- Bulk add/remove songs from a rotation.
- In the service plan editor, show a "Quick Add from [Rotation List]" option to speed up planning.

**Tracking:**

- Track when a song was added/removed from rotation (audit trail in Song record).
- In usage reports, filter by rotation to see "how many times did we use songs from our active rotation?"

---

## Part 5: CCLI Auto-Reporting (Phase 3)

### 5.1 Scope

Automatic, weekly reporting of song usage to CCLI on behalf of the church. This is a Phase 3 feature (post-MVP worship launch).

### 5.2 Overview

- Church enables "Auto-report to CCLI" in org settings.
- Every Monday (or configurable day), VolunteerCal compiles the previous week's song usage (all songs with CCLI numbers) and submits via CCLI API.
- Requires storing CCLI org credentials securely.

### 5.3 Implementation

- Similar to SongSelect auth: org settings form for CCLI account ID + API credentials.
- Weekly Vercel cron job (or similar) runs `POST /api/cron/ccli-report`.
- Queries all SongUsageRecords for the past week per church.
- Constructs CCLI API request (format TBD based on CCLI documentation).
- Submits and logs result in a `ccli_reports` collection (for audit trail).
- Sends success/failure notification to org admin.

---

## Part 6: ProPresenter Integration

### 6.1 Scope

Simplest possible integration: export a service plan in a format that ProPresenter can import, or provide a feed that a helper tool can consume.

### 6.2 Recommended Approach: Email Export

**Why this approach:**

- No complex API or authentication required.
- Extremely reliable; email delivery is ubiquitous.
- Zero learning curve: volunteers simply attach a downloaded file or open an email link.
- Works for monthly volunteers who don't need to master a tool.

**Implementation:**

1. **Generate Export:**
   - Service Plan detail page → "Export for ProPresenter" button.
   - Backend generates a `.json` or `.xml` file in a simple, ProPresenter-importable format.
   - File includes: plan title, date, items (songs with title, key, CCLI #, lyrics/chart URLs).

2. **Delivery:**
   - Auto-email the export file to the media/tech lead 24 hours before the service.
   - Include instructions: "Open this file in ProPresenter" (link to ProPresenter docs on import).
   - Also offer a download link in the service plan UI (manual fallback).

3. **File Format:**
   - Start simple: JSON structure mirroring ServicePlan.items.
   - If ProPresenter has a native XML or playlist format, generate that instead.
   - Example JSON:
     ```json
     {
       "service_date": "2026-04-05",
       "service_name": "Sunday Morning Worship",
       "items": [
         {
           "sequence": 1,
           "type": "song",
           "title": "Living Hope",
           "key": "D",
           "ccli_number": "7172095",
           "lyrics_url": "https://volunteercal.com/lyrics/12345"
         },
         ...
       ]
     }
     ```

**Alternative (if demand justifies):** Later, implement a lightweight ProPresenter API integration (check ProPresenter's developer documentation) to push playlists programmatically instead of email export.

### 6.3 Implementation Details

**API:**

- `POST /api/services/{id}/export-propresenter` generates export.
- `GET /api/services/{id}/export-propresenter?format=json|xml` returns file.

**UI:**

- Service Plan detail → "Export" dropdown menu:
  - Export for ProPresenter (JSON).
  - Export as PDF (for printing).
  - Email export to [email picker].

**Scheduling:**

- Vercel cron job, 24 hours before each published service plan:
  - Query churches + service plans.
  - Generate export, send email to tech/media lead.
  - Include opt-out preference per org/role.

---

## Part 7: Pricing and Packaging

### 7.1 Core Tiers (Unchanged)

Free, Starter, Growth, Pro, Enterprise tiers with existing limits on volunteers, ministries, roles, etc.[file:45]

All tiers include: scheduling, availability management, households, check-in, notifications, iCal feeds, ChMS imports, basic dashboards.[file:44][file:45]

### 7.2 Worship Add-On (New)

**Name:** "Worship & Planning Bundle" (or "Worship Module")

**Availability:** Growth, Pro, Enterprise (and as standalone add-on for Starter orgs).

**Included:**

- Song library (unlimited songs per org).
- Service planning: create and manage order of service.
- SongSelect integration (import songs, lyrics, charts).
- Stage Sync: real-time collaborative run sheet views.
- Song usage reporting (manual export).
- Rotation list management.
- Email export for ProPresenter (JSON format).

**Not Included (Phase 3):**

- CCLI auto-reporting.
- Advanced ProPresenter API sync.

**Pricing Options (Choose One):**

**Option A: Flat Add-On ($15/month)**

- Growth (tier $49) + Worship Add-On ($15) = $64/month.
- Pro (tier $99) + Worship Add-On ($15) = $114/month.
- Simple, predictable.

**Option B: Tiered Add-On (Scaled by Org Size)**

- Starter + Worship: $25/month.
- Growth + Worship: $25/month (included).
- Pro + Worship: $30/month (included).
- Enterprise: custom (included).
- Positions worship as "scaling" feature; larger churches pay incrementally more.

**Option C: Bake into Growth/Pro (Simpler SKU)**

- Growth ($49) includes all worship features except CCLI auto-report.
- Pro ($99) includes all worship features.
- Simplest for marketing; reduces SKU count; positions worship as a Growth+ differentiator.

**Recommendation:** Start with **Option C** (bake basic worship into Growth+Pro). If demand exists for a Starter-tier worship bundle later, add it. This keeps your messaging simple ("Growth unlocks worship planning") and aligns with how PCO positions Music Stand as an add-on to their core services.

### 7.3 CCLI Auto-Reporting (Phase 3)

**Scope:** Once auto-reporting is built, offer as either:

1. **Part of Worship Add-On** (simplest): include in the bundle.
2. **Separate add-on:** $5/month for automatic CCLI submission (for orgs that want song management but not Stage Sync).

### 7.4 Marketing and Messaging

**Core Messaging:**

- "VolunteerCal is built for churches: volunteer scheduling that actually fits small budgets, plus worship planning that replaces Planning Center Services."
- "Replace Planning Center + Music Stand without the ChMS overhead."

**Tier Messaging:**

- **Free/Starter:** "Organize your volunteers."
- **Growth:** "Organize and plan: scheduling + worship planning."
- **Pro:** "Advanced scheduling modes + full worship toolkit."
- **Enterprise:** "White-label + dedicated support."

---

## Part 8: Implementation Timeline and Milestones

### Phase 1: Service Profiles & Workflow Modes (Weeks 1-4)

- [ ] Implement perpetual service profiles with timeline changes (data model + API).
- [ ] Add optional team support (effective-from logic in schedule builder).
- [ ] Activate ministry-first and hybrid workflow modes.
- [ ] Build availability window and campaign broadcast.
- [ ] Build ministry-level approval UI and multi-stage workflow.

**Deliverable:** Orgs can run the full master-roster workflow with team-level refinement.

### Phase 2: Households UI (Week 1-2, parallel with Phase 1)

- [ ] Implement household creation and management UI (People page).
- [ ] Add household conflict display in schedule review.
- [ ] Add household notifications.

**Deliverable:** No more hidden household constraints; fully visible and manageable.

### Phase 3: Song Library & Service Planning (Weeks 5-8)

- [ ] Implement Song collection and library UI.
- [ ] Implement ServicePlan collection and editor.
- [ ] Build song import flows (manual add).
- [ ] Tag support (multiple tags per song) and rotation lists.

**Deliverable:** Admins can create and manage song library and service plans.

### Phase 4: SongSelect Integration (Weeks 9-10)

- [ ] Integrate SongSelect authentication.
- [ ] Implement song import from SongSelect.
- [ ] Optional: set up weekly re-sync of charts.

**Deliverable:** Worship leaders can pull from SongSelect directly.

### Phase 5: Stage Sync (Weeks 11-14)

- [ ] Implement real-time conductor/participant views.
- [ ] Build Firestore listeners and real-time sync.
- [ ] Create full-screen, optimized chart view.
- [ ] Email/link generation for stage-sync access.

**Deliverable:** Worship teams can collaborate in real-time without leaving VolunteerCal.

### Phase 6: Song Usage Reporting & ProPresenter Export (Weeks 15-16)

- [ ] Track song usage (create SongUsageRecord on service plan publish).
- [ ] Build song usage reporting UI.
- [ ] Implement CSV/PDF export.
- [ ] Build ProPresenter export (JSON) and email delivery.

**Deliverable:** Usage reports, CCLI compliance, and ProPresenter export.

### Phase 3+ (Post-MVP): CCLI Auto-Reporting & Advanced ProPresenter

- [ ] Integrate CCLI API for automatic reporting.
- [ ] Explore ProPresenter API for bi-directional sync.

---

## Part 9: Technical Considerations

### 9.1 Firestore and Real-Time Sync

- **Stage Sync relies on Firestore real-time listeners** for <500ms sync across devices.
- Ensure security rules allow authenticated volunteers to listen to specific service plan documents.
- Use Firestore transactions for conductor "next item" updates to prevent race conditions.

### 9.2 File Storage and Chart Management

- Song charts (PDFs) and chord sheets can be stored in Firebase Storage or Cloud Storage.
- Generate signed URLs with expiration for secure access.
- Consider CDN caching for frequently accessed charts.

### 9.3 Email Delivery at Scale

- Use Resend (current provider) for availability window campaigns and ProPresenter exports.
- Track email delivery (open, bounce, click) via Resend webhooks.
- For bulk sends (e.g., 200+ volunteers), use templates and batch sending.

### 9.4 Security and Access Control

- **ServicePlan and Stage Sync access:**
  - Authenticated users (volunteers + admins) can view via normal auth.
  - Stage Sync public access is token-protected; tokens stored in `stage_sync_sessions` with optional expiration and PIN.
  - Security rule: allow read if `token in request.query.token and token exists in stage_sync_sessions`.

- **SongSelect and CCLI Credentials:**
  - Encrypt credentials at rest (use Firestore encryption or a secrets manager like Google Secret Manager).
  - Only org admins can view/rotate credentials.

### 9.5 Backward Compatibility

- All service profile changes are additive; existing schedules and assignments remain unaffected.
- Workflow modes default to `team_first` for existing orgs to avoid disruption.
- Song library is optional; orgs without Worship Add-On don't see worship features.

---

## Part 10: Success Metrics and KPIs

### Adoption

- % of Growth+ orgs that enable Worship Add-On within 30 days of signup.
- % of orgs that run at least one master-roster schedule.
- Average time to activate ministry-level approval workflow.

### Usage

- Weekly active users on Stage Sync (per org).
- Service plans published per week (avg per org).
- Song library size per org (avg songs).
- Stage Sync concurrent device connections per service.

### Engagement

- Song usage report downloads per month.
- ProPresenter export emails sent/opened per month.
- Household constraints set up per org.
- Fairness score improvements in master-roster schedules.

### Churn and Revenue

- Churn rate for orgs with Worship Add-On vs. without.
- Net revenue from Worship Add-On tier upgrade + upsell.
- Customer lifetime value (Growth+ with Worship vs. Growth without).

---

## Part 11: Content and User Messaging Updates Required

### In-App Help and Onboarding

- **Setup wizard:** new section for workflow mode selection (team-first vs. centralized vs. hybrid).
- **Availability window tour:** explain how to announce and remind volunteers.
- **Ministry approval UI:** in-context help for refining schedules and approving.
- **Stage Sync intro banner:** on service plan publish, suggest enabling Stage Sync.

### Public Marketing

- Landing page: add "Worship Planning" section highlighting Song Library, Service Plans, Stage Sync, SongSelect, CCLI.
- Pricing page: add Worship Add-On tier and feature comparison.
- Blog posts:
  - "Replace Planning Center Services with VolunteerCal Worship Planning."
  - "Multi-Team Scheduling: How to Coordinate Fairly (Master Roster Mode)."
  - "Stage Sync: Real-Time Worship Planning for Teams."

### FAQ Updates

- "What is Stage Sync? How is it different from Music Stand?"
- "Can I import songs from SongSelect?"
- "How do I generate a CCLI report from VolunteerCal?"
- "Why are my volunteers getting multiple requests?"
  - Answer: "Because your teams are scheduling independently. Try Master Roster Mode for a single coordinated wave."

### Help Center / Docs

- **Workflow Modes Guide:** explains each mode, use cases, how to activate.
- **Master Roster Setup:** step-by-step process.
- **Household Setup:** how to group families and set constraints.
- **Worship Planning Guide:** song library, service plans, Stage Sync, reporting.
- **ProPresenter Integration:** how to export and import.

---

## Part 12: Open Questions and Assumptions

### Assumptions Made

1. **ProPresenter integration starts simple (email export)** unless and until deeper API integration is prioritized.
2. **Stage Sync is web-only** (no native app build).
3. **SongSelect and CCLI integrations are optional** per church; not all churches use them.
4. **Multi-tag support for songs** is supported from the start (tag field is array, not string).
5. **Service profile changes are forward-looking** and do not retroactively modify published assignments.
6. **Workflow modes are per-church** (can vary by org, not global).
7. **Worship Add-On pricing is flat ($15/month or baked into Growth+).**

### Questions for Product/Design Review

1. Should households be limited by tier (e.g., unlimited on Pro only)?
2. Should Stage Sync require a specific tier (e.g., Pro+), or be included in all tiers with Worship Add-On?
3. Should ProPresenter export be generated as downloadable file, auto-emailed, or both?
4. Should CCLI auto-reporting require a separate CCLI credentials form, or can we infer from SongSelect login?
5. Should "Song Rotation" be its own collection/UI section, or just tags + filters?

---

## Appendix: Glossary

| Term | Definition |
|------|-----------|
| **Service Profile** | A recurring volunteer slot (weekly service, youth group) with a persistent structure (ministries, roles, times). |
| **Service Plan** | An instance of a service on a specific date with an order-of-service (songs, prayers, sermon, etc.). |
| **Effective From** | The date on which a service profile change (e.g., add a ministry) takes effect. |
| **Master Roster** | A central schedule covering multiple services and all ministries, generated once per quarter or period. |
| **Workflow Mode** | The methodology for scheduling: team-first (independent), centralized (admin-led), or hybrid (admin-led with team refinement). |
| **Stage Sync** | Real-time, web-based collaborative view of a service plan for worship teams and tech operators. |
| **Conductor** | The person (usually worship leader) who controls Stage Sync and advances to the next item. |
| **Household Constraint** | A scheduling rule that keeps family members together or apart on the same service. |
| **Rotation List** | A curated subset of songs in the library, grouped by period or context (e.g., "Spring 2026 Rotation"). |
| **SongSelect** | CCLI's platform for importing lyrics, chord charts, and song data. |
| **CCLI** | Christian Copyright Licensing International; churches report song usage to maintain copyright compliance. |
| **ProPresenter** | Professional stage display software used by churches to manage lyrics, graphics, and video during services. |

---

**End of Specification**

*This document serves as the comprehensive technical and functional brief for all development work related to the Service Planning, Worship Planning, and Scheduling Mode expansion. It is intended to be consumed by Claude Code (or equivalent AI assistant) as the definitive source of requirements, data models, UI/UX direction, and success criteria.*