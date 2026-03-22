# VolunteerCal Feature Spec: Native Check-In, Room/Resource Scheduling & WorshipTools UX Enhancements

**Document Version:** 1.0
**Date:** March 22, 2026
**Prepared For:** Claude Code Implementation
**Codebase:** `HarpElle/volunteercalendar` (Next.js 16 + TypeScript + Firebase + Tailwind CSS v4)

---

## Document Purpose & How to Use This Spec

This document is a developer handoff specification for three feature areas. It is written to give Claude Code (or any developer) enough precision to begin writing code immediately without needing to infer architecture or ask basic structural questions.

**Before writing any code:**
1. Read `src/lib/types/index.ts` to understand existing type conventions
2. Read `src/lib/constants/index.ts` to understand tier gating patterns
3. Read `src/lib/utils/ical.ts` — it already exists and handles iCal format; the room/calendar feature extends it
4. Read one existing API route (e.g., `src/app/api/songs/route.ts`) to understand the auth/response pattern

**Conventions used in this document:**
- All Firestore paths use real collection names from the existing codebase
- TypeScript interfaces follow the naming conventions in `src/lib/types/index.ts`
- API routes follow the pattern `src/app/api/[feature]/route.ts` (Next.js App Router)
- Auth checks reference the existing `src/lib/firebase/admin.ts` + Bearer token verification pattern
- Tier gating uses `SubscriptionTier` from the existing type definitions
- shadcn/ui component names follow the existing `src/components/ui/` conventions

**Implementation order recommendation:** Start with Part 2 (Room/Resource Scheduling). It is the most self-contained, the most thoroughly specified, and it establishes shared infrastructure (iCal extensions, reservation conflict patterns, public display routes) that benefits everything else.

---

## Part 1: Native Children's Check-In

### 1.1 Feature Overview & Goals

Native Children's Check-In is a first-party check-in system built directly into VolunteerCal. It eliminates any dependency on KidCheck, Breeze Check-In, or Planning Center Check-Ins. Churches either have no existing system and need one, or they are migrating off an incumbent system (typically Breeze or PCO) and want their volunteer scheduling and children's check-in data unified in one place.

**Primary hardware target:** Two Brother QL-820NWB label printers connected to church WiFi, and two iPads mounted near Sunday school rooms running the check-in kiosk at `/checkin` in a browser — no app install required.

**Multi-printer support:** The system is designed with a `PrinterAdapter` interface so any church can use their existing hardware. Tier 1 fully supported printers (network printing, no client software required): Brother QL series, Zebra ZD series. Tier 2 supported with a setup step: Dymo LabelWriter. Tier 3 future roadmap: Star Micronics CloudPRNT.

**Goals:**
- Families check in children at an iPad kiosk in under 30 seconds
- Child gets a name label; parent gets a matching security-code stub
- Teachers see a real-time list of checked-in children including allergy/medical alerts
- Secure pickup: volunteer verifies security code before releasing child
- Full attendance records per child, per room, per service date
- Drop-in replacement for Breeze with a supported CSV import path

**What this is NOT:**
- A general event check-in system (for adults, event registration, or attendance tracking beyond children's ministry)
- A volunteer scheduling replacement (scheduling remains in the existing VolunteerCal scheduler)
- A replacement for Breeze's full ChMS functionality — only the children's check-in workflow is covered

### 1.2 Household & Child Profile Data Model

All check-in data lives under `churches/{churchId}/` following the existing VolunteerCal collection structure.

#### TypeScript Interfaces

Add all of the following to `src/lib/types/index.ts`:

```typescript
// ─── Household ────────────────────────────────────────────────────────────────

export interface Household {
  id: string                         // Firestore doc ID
  church_id: string
  // Guardians (at least one required)
  primary_guardian_name: string      // "Sarah Johnson"
  primary_guardian_phone: string     // E.164 format: "+15125551234"
  secondary_guardian_name?: string
  secondary_guardian_phone?: string
  // QR check-in token — unique per household, stable across sessions
  // URL: /checkin?token={qr_token}
  qr_token: string                   // crypto.randomBytes(16).toString('hex')
  photo_url?: string                 // Firebase Storage URL (optional family photo)
  // Import tracking
  imported_from?: 'breeze' | 'pco' | 'manual'
  external_id?: string               // Breeze person ID or PCO household ID, for dedup
  // Timestamps
  created_at: string                 // ISO datetime
  updated_at: string
  created_by?: string                // user_id if created by admin; undefined if self-registered
}

// ─── Child ────────────────────────────────────────────────────────────────────

export interface Child {
  id: string
  church_id: string
  household_id: string               // FK → churches/{churchId}/households/{id}
  // Identity
  first_name: string
  last_name: string
  preferred_name?: string            // "goes by Mia"
  date_of_birth?: string             // ISO date "2019-04-15" (optional for visitor import)
  grade?: ChildGrade
  photo_url?: string                 // Firebase Storage URL
  // Room assignment (default; overridable at check-in)
  default_room_id?: string           // FK → churches/{churchId}/rooms/{id}
  // Allergy & medical
  has_alerts: boolean                // denormalized flag for fast query
  allergies?: string                 // free text: "peanuts, tree nuts"
  medical_notes?: string             // free text: "epi-pen in bag, asthma inhaler"
  // Import tracking
  imported_from?: 'breeze' | 'pco' | 'manual'
  external_id?: string
  // Status
  is_active: boolean                 // soft delete
  created_at: string
  updated_at: string
}

export type ChildGrade =
  | 'nursery'      // 0–1 year
  | 'toddler'      // 1–2 years
  | 'pre-k'        // 3–4 years
  | 'kindergarten'
  | '1st' | '2nd' | '3rd' | '4th' | '5th' | '6th'

// ─── CheckInSession ───────────────────────────────────────────────────────────

export interface CheckInSession {
  id: string
  church_id: string
  child_id: string                   // FK → churches/{churchId}/children/{id}
  household_id: string               // denormalized for queries
  // Service context
  service_date: string               // ISO date "2026-03-22"
  service_id?: string                // FK → churches/{churchId}/services/{id} (if tied to VC service)
  // Room
  room_id: string                    // FK → churches/{churchId}/rooms/{id}
  room_name: string                  // denormalized for display without join
  // Security
  security_code: string              // 4-char alphanumeric, session-scoped
  security_code_expires_at: string   // ISO datetime — set to service end time + 2 hr
  // Check-in
  checked_in_at: string              // ISO datetime
  checked_in_by_user_id?: string     // volunteer/admin who performed check-in; null if self-serve kiosk
  pre_checked_in: boolean            // true if family used pre-check-in SMS link
  // Checkout
  checked_out_at?: string            // ISO datetime; undefined = still checked in
  checked_out_by_user_id?: string    // volunteer who confirmed pickup
  // Alert snapshot (captured at check-in time)
  alerts_acknowledged: boolean       // volunteer tapped "acknowledge" on allergy screen
  alert_snapshot?: string            // copy of allergies + medical_notes at check-in time
  created_at: string
}

// ─── CheckIn Settings (single config doc per church) ──────────────────────────

export interface CheckInSettings {
  // Service times (used for pre-check-in window and late arrival threshold)
  service_times: ServiceTime[]
  // Pre-check-in window: families can pre-check-in this many minutes before service
  pre_checkin_window_minutes: number       // default: 30
  // Late arrival threshold: children checking in after this many minutes post-start
  // will trigger a visual late-arrival alert on the teacher view
  late_arrival_threshold_minutes: number  // default: 20
  // Capacity notifications
  capacity_sms_recipient_phone?: string   // coordinator's phone for SMS on capacity hit
  // Printer configurations (array supports multiple stations)
  printers: PrinterConfig[]
  // Breeze import settings
  breeze_import_grade_mapping?: Record<string, ChildGrade>  // custom grade name → ChildGrade
  updated_by: string
  updated_at: string
}

export interface ServiceTime {
  id: string           // uuid
  name: string         // "9:00 AM Service", "11:00 AM Service"
  day_of_week: number  // 0=Sunday…6=Saturday
  start_time: string   // "09:00" (HH:mm, local church time)
  end_time: string     // "10:30"
  is_active: boolean
}

// ─── Printer Configuration ────────────────────────────────────────────────────

export type PrinterType = 'brother_ql' | 'zebra_zd' | 'dymo_labelwriter'

export interface PrinterConfig {
  id: string                          // uuid
  station_name: string                // "Front Kiosk", "Room 200 Kiosk"
  printer_type: PrinterType
  ip_address: string                  // for Tier 1 network printers
  port?: number                       // default: 9100 for RAW TCP
  label_size: BrotherLabelSize | ZebraLabelSize | DymoLabelSize
  is_active: boolean
}

export type BrotherLabelSize = 'DK-2251' | 'DK-1201' | 'DK-2205'
export type ZebraLabelSize = '2x1' | '2x2' | '4x1'
export type DymoLabelSize = '30256' | '30321'  // shipping / address labels
```

#### Firestore Collection Paths

```
churches/{churchId}/households/{householdId}
churches/{churchId}/children/{childId}
churches/{churchId}/checkInSessions/{sessionId}
churches/{churchId}/checkinSettings/config          ← single document
```

#### Firestore Composite Indexes (add to `firestore.indexes.json`)

```json
{
  "collectionGroup": "checkInSessions",
  "queryScope": "Collection",
  "fields": [
    { "fieldPath": "service_date", "order": "ASCENDING" },
    { "fieldPath": "room_id", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "checkInSessions",
  "queryScope": "Collection",
  "fields": [
    { "fieldPath": "service_date", "order": "ASCENDING" },
    { "fieldPath": "child_id", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "checkInSessions",
  "queryScope": "Collection",
  "fields": [
    { "fieldPath": "service_date", "order": "ASCENDING" },
    { "fieldPath": "checked_out_at", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "children",
  "queryScope": "Collection",
  "fields": [
    { "fieldPath": "household_id", "order": "ASCENDING" },
    { "fieldPath": "is_active", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "households",
  "queryScope": "Collection",
  "fields": [
    { "fieldPath": "primary_guardian_phone", "order": "ASCENDING" },
    { "fieldPath": "church_id", "order": "ASCENDING" }
  ]
}
```

### 1.3 Check-In Kiosk Flow (`/checkin`)

The kiosk runs at `/checkin` — a Next.js route with a completely blank layout (no nav, no sidebar). Same layout mechanism as `/display/room/[roomId]` from Part 2: create `src/app/checkin/layout.tsx` with no navigation chrome, `overflow: hidden`, optimized for portrait-mode tablet display.

The kiosk is **stateless from session to session** — there is no login. Families interact via touch. A volunteer standing nearby can assist but is not required for standard check-in.

---

#### Screen 1 — Family Lookup

This is the idle/home screen. Auto-resets to this screen after 30 seconds of inactivity.

**Primary path — QR code scan:**
- Camera viewfinder centered on screen, using the browser `getUserMedia` API + `jsQR` npm package for QR decoding (no native app required)
- When a valid QR token is decoded, immediately advance to Screen 2 (no button press needed)
- QR token format: URL `https://app.volunteercal.com/checkin?token={qr_token}` — also works by pointing the iPad camera at the QR from the family's phone screen

**Secondary path — Phone number lookup:**
- Below the camera viewfinder: "Or search by phone number"
- Numeric keypad (large touch targets) — family enters last 4 digits of their phone number
- Tap "Find Family" — matches against `primary_guardian_phone` or `secondary_guardian_phone` where the last 4 digits match
- If multiple matches: show a disambiguation list (guardian name + masked phone)
- If no match: show "First time? Let's get you set up" → enter full phone number → creates Household + prompts for child info → confirm

**First-time visitor path:**
1. Enter full 10-digit phone number
2. Enter guardian name(s)
3. Add each child: first name, last name, grade (picker)
4. Skip photo for now (can be added by admin later)
5. Household + children written to Firestore
6. Advance to Screen 2

---

#### Screen 2 — Child Selection

Shows all `is_active: true` children for the household.

Per child, display:
- Photo (circular, if set) or initials avatar
- First name + last name
- Grade badge
- Assigned room name (from `default_room_id`, resolved to room name)
- Red alert badge if `has_alerts: true` (shown as "⚠ Allergy Alert")
- Room capacity indicator: if room is at ≥80% of `capacity`, show yellow "Near capacity"; at 100%, show red "At capacity"

**Interaction:**
- Tap a child card to toggle selection (tap again to deselect)
- Multiple children can be selected simultaneously
- If a child's assigned room is at capacity, the card shows an alternative room suggestion (if admin has configured one)
- Volunteer override: a small "Change Room" button on each child card opens a room picker — allows check-in to a different room than default (useful for visitors or when a room is full)
- "Continue" button activates when ≥1 child is selected

---

#### Screen 3 — Allergy Review & Confirm

Only shown if at least one selected child has `has_alerts: true`.

**Allergy acknowledgment (mandatory):**
- For each child with alerts: show child name, photo, and the full `allergies` + `medical_notes` text
- Red alert card with prominent styling
- Volunteer must tap "I have reviewed the alerts for [Child Name]" per child before proceeding
- All alerts must be acknowledged; the "Check In" button remains disabled until all are tapped

**Confirmation summary (shown to all, alerts or not — can be a combined screen if no alerts):**
- List of children being checked in + their assigned rooms
- Service date and time
- "Check In & Print Labels" button (primary action)
- "Back" button to change selection

---

#### Screen 4 — Success

After tapping "Check In & Print Labels":
1. `POST /api/checkin/checkin` is called — generates security codes, creates `CheckInSession` documents, triggers label print jobs
2. Security code displayed large on screen in a bold monospace font (one code per family group — all children checked in together share one security code)
3. "Labels are printing…" message with a spinner; on print confirmation: "✓ Labels printed"
4. "Done — Check In Another Family" button resets to Screen 1 after 8 seconds (auto-reset with countdown)
5. If printer is offline: "Printer is offline — labels could not be printed. Write down your security code: **[CODE]**" — displayed prominently; check-in session is still recorded

---

#### Pre-Check-In Flow

Families can pre-check-in via a link sent to their phone up to 30 minutes before service start.

- Admin or scheduled job sends SMS: "Ready for Sunday? Pre-check in [Child Name] at [URL]"
- URL: `https://app.volunteercal.com/checkin/pre?token={qr_token}&service_date=2026-03-22`
- Family taps the link, selects children, reviews alerts, and submits
- `CheckInSession` is created with `pre_checked_in: true`
- When the family arrives at the kiosk and scans their QR code, Screen 2 shows a "Pre-checked in ✓" badge on each pre-registered child
- Labels print automatically on QR scan (no button required for pre-checked-in children)
- Security code was generated at pre-check-in time and is consistent across both flows

### 1.4 Label Design & Printing

#### PrinterAdapter Interface

All printer types implement a common interface. New printer types can be added without touching check-in flow logic.

```typescript
// src/lib/services/printing/PrinterAdapter.ts

export interface LabelJob {
  type: 'child_label' | 'parent_stub'
  child_name?: string           // for child label
  child_names?: string[]        // for parent stub (multiple children)
  room_name?: string
  service_date: string          // "Sun Mar 22, 2026"
  security_code: string         // "K7M4"
  church_name: string
  has_allergy_alert: boolean    // triggers red banner on child label
}

export interface PrintResult {
  success: boolean
  error?: string
  printer_id: string
}

export interface PrinterAdapter {
  printLabel(job: LabelJob, config: PrinterConfig): Promise<PrintResult>
  testPrint(config: PrinterConfig): Promise<PrintResult>
}
```

**Factory:**

```typescript
// src/lib/services/printing/PrinterAdapterFactory.ts
export function getPrinterAdapter(type: PrinterType): PrinterAdapter {
  switch (type) {
    case 'brother_ql':    return new BrotherQLAdapter()
    case 'zebra_zd':      return new ZebraZDAdapter()
    case 'dymo_labelwriter': return new DymoAdapter()
    default: throw new Error(`Unsupported printer type: ${type}`)
  }
}
```

---

#### Tier 1: Brother QL Series (Primary Target)

**Models:** QL-800, QL-810W, QL-820NWB
**Connection:** WiFi 802.11b/g/n (QL-810W, QL-820NWB) — use TCP/IP RAW printing, **port 9100**
**Color:** QL-820NWB supports 2-color (black + red) with DK-2251 label roll; others monochrome

**npm packages:**
- No official Node.js SDK from Brother. Use the `brother_ql` Python library invoked via `child_process.execFile` as the primary approach.
- Python package: `brother_ql` (pip: `brother-ql`, GitHub: `pklaus/brother_ql`) — supports `--printer tcp://{ip}:{port}` and prints PNG images directly
- For PNG generation: `canvas` npm package (`npm install canvas`) — Node.js Canvas API compatible with server-side rendering
- Alternative Node.js-native path (no Python dep): open TCP socket via `net.createConnection(9100, ip)`, send Brother PT-CBP raster format. This is more complex; treat as a future refinement.

**Recommended label sizes:**
- Child label: **DK-2251** (62mm continuous, black+red on QL-820NWB) — 62mm wide, cut to ~70mm tall. Use red background for allergy alert banner.
- Parent stub: **DK-1201** (29mm × 90mm die-cut address labels) — compact, fits in pocket. Monochrome.
- Budget/monochrome alternative: **DK-2205** (62mm continuous, black only) for both labels

**Child label layout (62mm × 70mm, DK-2251):**
```
┌─────────────────────────────────────┐
│  ██████████████████████████████████ │  ← ALLERGY ALERT (red bg, white text)
│  ⚠  PEANUT ALLERGY — SEE TEACHER   │    only shown if has_allergy_alert
├─────────────────────────────────────┤
│                                     │
│  EMMA JOHNSON                       │  ← child name (24pt bold)
│  Kindergarten — Room 102            │  ← grade + room (12pt)
│  Sun Mar 22, 2026                   │  ← service date (10pt)
│                                     │
│         ┌───────────┐               │
│         │   K7M4    │               │  ← security code (36pt bold monospace)
│         └───────────┘               │
└─────────────────────────────────────┘
```

**Parent stub layout (29mm × 90mm, DK-1201):**
```
┌──────────────────┐
│  Hillside Church │  ← church name (8pt)
│  Mar 22, 2026    │  ← date (8pt)
├──────────────────┤
│                  │
│     K7M4         │  ← security code (28pt bold monospace, centered)
│                  │
├──────────────────┤
│ Emma, Liam       │  ← child first names (9pt)
└──────────────────┘
```

**BrotherQLAdapter implementation sketch:**

```typescript
// src/lib/services/printing/BrotherQLAdapter.ts
import { execFile } from 'child_process'
import { createCanvas } from 'canvas'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

export class BrotherQLAdapter implements PrinterAdapter {
  async printLabel(job: LabelJob, config: PrinterConfig): Promise<PrintResult> {
    const pngPath = await this.renderLabelToPNG(job, config.label_size as BrotherLabelSize)
    const printerUrl = `tcp://${config.ip_address}:${config.port ?? 9100}`
    try {
      await this.runBrotherQL(printerUrl, config.label_size as BrotherLabelSize, pngPath)
      return { success: true, printer_id: config.id }
    } finally {
      await unlink(pngPath).catch(() => {})
    }
  }

  private renderLabelToPNG(job: LabelJob, size: BrotherLabelSize): Promise<string> {
    // Use node-canvas to render the label at 300dpi
    // DK-2251 at 300dpi: 732px wide, continuous (variable height)
    // DK-1201 at 300dpi: 342px × 1063px
    // ... render logic here ...
  }

  private runBrotherQL(printer: string, label: string, imagePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile('brother_ql', [
        '--printer', printer,
        'print',
        '--label', label,
        imagePath
      ], (err) => err ? reject(err) : resolve())
    })
  }
}
```

**Setup requirement:** The Next.js server must have Python 3 and `brother-ql` installed (`pip install brother-ql`). Document this in the deployment guide.

---

#### Tier 1: Zebra ZD Series

**Models:** ZD421, ZD421-CN (Color), ZD620
**Connection:** WiFi or Ethernet — RAW TCP, **port 9100**
**Language:** ZPL (Zebra Programming Language) — plain text, no binary raster needed
**Note:** This is what Planning Center Check-Ins uses for label printing. Excellent ecosystem support.

**npm packages:**
- `zpl-image` (`npm install zpl-image`) — converts PNG to ZPL-compatible GRF (Graphic Field) — useful for logo embedding
- No dedicated ZPL generation library is needed for structured label templates; ZPL is a human-readable DSL that can be template-stringed directly
- TCP socket printing: use Node.js `net` module (built-in, no npm package needed)

**Recommended label sizes:**
- Child label: **2" × 1"** die-cut (Z-Select 10015722 or equivalent) — 2" wide, 1" tall — tight but legible
- Parent stub: **2" × 1"** same roll — security code large, child names
- Larger option: **2" × 2"** for more room (better for allergy alerts)

**ZPL Child Label Template (2"×1" at 203dpi = 406×203 dots):**

```typescript
// src/lib/services/printing/ZebraZDAdapter.ts

function buildChildLabelZPL(job: LabelJob): string {
  const alertBlock = job.has_allergy_alert
    ? `^FO0,0^GB406,28,28^FS^FO5,5^FR^A0N,18,18^FD⚠ ALLERGY - SEE TEACHER^FS`
    : ''
  const yOffset = job.has_allergy_alert ? 32 : 8

  return `
^XA
^CI28
${alertBlock}
^FO8,${yOffset}^A0N,28,28^FD${job.child_name?.toUpperCase()}^FS
^FO8,${yOffset + 34}^A0N,18,18^FD${job.room_name}^FS
^FO8,${yOffset + 56}^A0N,16,16^FD${job.service_date}^FS
^FO280,${yOffset}^A0N,52,36^B3N,N,2,N,N^FD${job.security_code}^FS
^XZ`.trim()
}

function buildParentStubZPL(job: LabelJob): string {
  const names = (job.child_names ?? []).join(', ')
  return `
^XA
^CI28
^FO10,5^A0N,14,14^FD${job.church_name}  ${job.service_date}^FS
^FO10,22^A0N,48,40^FD${job.security_code}^FS
^FO10,76^A0N,16,16^FD${names}^FS
^XZ`.trim()
}

export class ZebraZDAdapter implements PrinterAdapter {
  async printLabel(job: LabelJob, config: PrinterConfig): Promise<PrintResult> {
    const zpl = job.type === 'child_label'
      ? buildChildLabelZPL(job)
      : buildParentStubZPL(job)
    await this.sendZPL(config.ip_address, config.port ?? 9100, zpl)
    return { success: true, printer_id: config.id }
  }

  private sendZPL(ip: string, port: number, zpl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const net = require('net')
      const socket = net.createConnection(port, ip, () => {
        socket.write(zpl, 'utf8', () => {
          socket.end()
          resolve()
        })
      })
      socket.on('error', reject)
      socket.setTimeout(5000, () => {
        socket.destroy()
        reject(new Error('Printer connection timeout'))
      })
    })
  }
}
```

---

#### Tier 2: Dymo LabelWriter (With Setup Step)

**Models:** LabelWriter 450, 550, 550 Turbo
**Connection:** USB or network; prints via **Dymo Connect software** running on the kiosk device
**Requirement:** Dymo Connect (macOS/Windows, free) must be installed on the device running the kiosk. Dymo Connect exposes a local HTTP REST API at `http://localhost:41951/DYMO/DLS/Printing/`.

**npm/browser-side package:**
- Dymo's official JS framework: `@dymo/dymo-connect` — communicates with the local Dymo Connect service
- Installation: `npm install @dymo/dymo-connect`
- This is a **client-side** integration only (browser → localhost Dymo service). The Next.js API route cannot reach a per-kiosk Dymo service remotely. **Architecture differs from Tier 1**: The print request is initiated from the kiosk browser directly to Dymo Connect, not from the server.

**Recommended label sizes:**
- **30256** (2.3" × 0.7") — compact child label / parent stub combo
- **30321** (1.4" × 3.5") — address label, more text space

**Admin setup instructions to show in UI:**
1. Download and install Dymo Connect from dymo.com on the kiosk device
2. Open Dymo Connect at least once to complete setup
3. Ensure "Allow web apps to print" is enabled in Dymo Connect preferences
4. Reload the VolunteerCal kiosk page

**DymoAdapter:** Unlike Tier 1 adapters, `DymoAdapter` generates label XML/JSON for the Dymo SDK and returns it in the API response payload. The kiosk client-side code (not the server) calls the Dymo Connect API directly.

```typescript
// The API route returns a dymo_payload when printer_type === 'dymo_labelwriter'
// The client-side kiosk code handles the actual print call:
// import { openLabelXml, getPrinters } from '@dymo/dymo-connect'
```

---

#### Tier 3: Star Micronics CloudPRNT (Future Roadmap)

Star CloudPRNT is a cloud-based printing protocol where the printer polls a server endpoint for print jobs. No local IP configuration needed; printers self-register via internet. Models include TSP143IV and mC-Label3.

**Architecture note:** The printer polls `POST /api/checkin/cloudprint/poll` (server acts as the CloudPRNT server). The server queue holds pending print jobs; the printer fetches and renders them. Label content is returned as HTML or PNG.

**Spec this as a future feature.** Do not implement in the current phase. Add a `TODO: CloudPRNT support` comment in `PrinterAdapterFactory.ts`.

---

#### Multi-Print Sequence

When a family checks in N children, the print sequence is:
1. Print one child label per child (N labels)
2. Print one parent stub (one stub per family group, listing all children's names + single shared security code)
3. All print jobs are sent sequentially to the configured station printer
4. Total print jobs: N + 1

A family can have two iPads (two kiosk stations) with two different printers configured. The printer used is determined by the `PrinterConfig` associated with the kiosk's station (passed via query param: `/checkin?station={stationId}`). If no station is specified, use the first active printer in `checkinSettings.printers`.

---

#### Offline / Error Handling

- If `sendZPL` or `BrotherQLAdapter` returns an error, the API still records the `CheckInSession` successfully
- Response includes `print_errors: string[]` — kiosk displays the "Printer offline" fallback screen
- Retry button on Screen 4: calls `POST /api/checkin/print` with the existing session IDs without re-running check-in
- Admin can reprint from the room view or check-in admin panel

### 1.5 Secure Pickup Flow

At dismissal, a parent or authorized guardian presents the pickup stub (physical paper or the security code shown in their pre-check-in SMS).

**Flow for the check-in volunteer:**
1. Open `/checkin/room/[roomId]` or `/checkin/pickup` on the room's tablet
2. Tap the child's card (or search by name)
3. A "Confirm Pickup" modal appears — type or tap in the 4-character security code
4. If code matches `CheckInSession.security_code`: green confirmation, session updated with `checked_out_at` and `checked_out_by_user_id`
5. If code does not match: **prominent red mismatch alert** — "WRONG CODE — Do NOT release child". Do not show who the correct code belongs to. Log the failed attempt.
6. Security code is session-scoped — expires at `security_code_expires_at`. After expiry, a coordinator override (full auth login) is required.

**Security code generation:**
```typescript
// src/lib/utils/securityCode.ts
const SAFE_CHARS = 'ACDEFGHJKLMNPQRTUVWXY3479'  // excludes 0/O, 1/I/L, 2/Z, 5/S, 6/G, 8/B for visual clarity
export function generateSecurityCode(): string {
  return Array.from({ length: 4 }, () =>
    SAFE_CHARS[Math.floor(Math.random() * SAFE_CHARS.length)]
  ).join('')
}
```

One security code is generated per check-in event (all children in the same household checking in together share a code). If two children from the same household check in separately (different kiosk sessions), they each get their own code.

**Failed attempt logging:** Add a `CheckInAlert` document to `churches/{churchId}/checkinAlerts`:
```typescript
interface CheckInAlert {
  id: string
  church_id: string
  session_id: string
  child_id: string
  alert_type: 'wrong_code' | 'expired_code' | 'capacity_exceeded'
  attempted_code?: string   // what was entered (for wrong_code)
  occurred_at: string
  resolved: boolean
  resolved_by?: string
  resolved_at?: string
}
```

### 1.6 Teacher / Room View (`/checkin/room/[roomId]`)

This is a **read-only** URL for teachers' devices. No login is required — the room token in the URL is the auth mechanism (similar to the display token in Part 2). The page auto-refreshes via Firestore `onSnapshot`.

**Route:** `/checkin/room/[roomId]?token={roomCheckinToken}&date={ISO_date}`

The `roomCheckinToken` is a separate token stored on the Room document (`checkin_view_token: string`) — different from the iCal calendar token. Regeneratable by admins.

**Page layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Room 102 — Kindergarten             Sun, Mar 22 · 9:00 AM      │
│  [12 checked in]  [2 checked out]  [capacity: 15]               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  EMMA    │  │  LIAM    │  │  SOFIA   │  │  JAKE    │       │
│  │ Johnson  │  │ Martinez │  │ Chen     │  │ Williams │       │
│  │          │  │ ⚠ NUT   │  │          │  │ ⚠ ASTHMA│       │
│  │ 9:02 AM  │  │ 9:05 AM  │  │  ★ LATE │  │ 9:15 AM  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

**Child card states:**
- **Checked in:** White card, check-in time in small text at bottom
- **Has alerts:** Red badge with abbreviated alert ("⚠ NUT ALLERGY" / "⚠ EPIPEN" / "⚠ ASTHMA") — tap to see full notes
- **Late arrival (≥ threshold past service start):** Yellow star ★ badge + "LATE" text
- **Checked out:** Grey card with strikethrough name and checkout time

**Real-time updates:** Firestore `onSnapshot` listener on `churches/{churchId}/checkInSessions` filtered by `room_id` and `service_date`. New check-ins appear immediately. Checkout updates grey out the card.

**Late arrival alert:** When a child's `checked_in_at` is ≥ `late_arrival_threshold_minutes` after the service start time, the card shows a yellow "★ LATE" badge. The page also shows a toast notification: "Late arrival: Emma Johnson just checked in."

**Teacher alert tap:** Tapping a child card with `has_alerts: true` shows a full-screen modal:
```
┌──────────────────────────────────────┐
│  ⚠ ALLERGY ALERT                    │
│  Emma Johnson                        │
├──────────────────────────────────────┤
│  Allergies: Peanuts, tree nuts       │
│  Medical notes: Epi-pen in backpack, │
│  call parent immediately if exposed  │
│                                      │
│  Parent phone: (512) 555-1234        │
└──────────────────────────────────────┘
```

**Implementation:** Next.js page with client-side Firestore listener. No auth middleware — the token in the URL is validated server-side before rendering (returns 404 for invalid token). Blank layout (same as kiosk).

### 1.7 Late Arrival & Capacity Notifications

**Room capacity:**
Capacity thresholds are stored on the `Room` document (`capacity` field, from Part 2). Check-in logic reads `capacity` from the Room document.

- **80% threshold:** Warning badge shown on Screen 2 (child selection) and in the teacher view header
- **100% threshold:** Alert on Screen 2 ("Room 102 is at capacity — suggest Room 104") + SMS to coordinator

**SMS notification (capacity):**
Follow existing `src/lib/services/sms.ts` pattern (Twilio):
```
SMS to checkinSettings.capacity_sms_recipient_phone:
"[Church Name] Check-In: Room 102 (Kindergarten) has reached capacity (15/15).
Consider redirecting to Room 104. – VolunteerCal"
```
Send once when capacity is first hit; do not send again until the room drops below 80% and re-hits 100% (track with a `capacity_sms_sent_at` field on the session aggregate — or use a simple in-memory debounce on the API route, acceptable for this use case).

**Alternative room suggestion:**
Store `overflow_room_id?: string` on the `Room` document. When check-in detects the target room is at capacity, automatically suggest the overflow room on Screen 2.

**Late arrival SMS:**
No SMS sent. Late arrival is a visual indicator only (teacher view badge). Rationale: parents don't need to be notified — they already dropped the child off. Teachers see the ★ badge.

### 1.8 Attendance & Reporting

**Routes:**
- `/dashboard/checkin/reports` — admin attendance dashboard
- `/api/admin/checkin/report` — data endpoint (see Section 1.10)

**Metrics available:**

| Report | Description | Grouping options |
|--------|-------------|------------------|
| Weekly summary | Total check-ins per service date | Per room, per grade |
| Child attendance history | All sessions for a specific child | Date range |
| First-timers | Children with exactly 1 session in date range | Per room |
| Consistent attenders | Children with ≥ N sessions in date range | Configurable N |
| Lapsed | Children with 0 sessions in the last N weeks but active historically | Configurable N |
| Room occupancy | Average attendance per room per service | Date range |

**CSV export:** Every report page has an "Export CSV" button that hits the report API with `?format=csv`. The response streams a CSV file download.

**Integration with existing VolunteerCal attendance infrastructure:**
If the church has services tied to VolunteerCal `services` documents, cross-reference `CheckInSession.service_id` with the `assignments` collection to show children's attendance alongside volunteer attendance on the same service detail page. This requires only a UI addition — no schema changes.

### 1.9 Admin Setup

**Route:** `/dashboard/checkin/admin` (new top-level sub-section under a "Check-In" dashboard nav item)

#### Household & Child Management

- List of all households with search (name, phone)
- Household detail: edit guardian names/phones, regenerate QR token, download QR code as PNG
- Child detail: edit name, DOB, grade, room assignment, photo, allergies/medical notes, active flag
- Add household / add child manually

#### Printer Configuration

**Printer settings UI** (`/dashboard/checkin/admin/printers`):

Form fields per printer:
- Station name (text)
- Printer type (dropdown: Brother QL / Zebra ZD / Dymo LabelWriter)
- IP address (text, validated as IPv4) — not shown for Dymo
- Port (number, default 9100) — not shown for Dymo
- Label size (dropdown, options filtered by printer type)
- Active toggle

**Test Print button:** Sends a `POST /api/admin/checkin/printer/test` with the printer config. The API generates a sample label ("Test Child — Room 101 — TEST") and sends it to the printer. Returns success or the specific error (timeout, connection refused, etc.). Displays result inline without page reload.

**Dymo setup instructions:** When Dymo LabelWriter is selected, show the setup callout (see Section 1.4, Tier 2).

#### Class / Room Age-Grade Assignments

- Per room, configure: default grade range (e.g., Room 101 = kindergarten), max capacity, overflow room
- These settings extend the `Room` document from Part 2 — add fields `default_grades: ChildGrade[]`, `overflow_room_id?: string`

#### Service Time Configuration

- Add/edit service times (name, day of week, start time, end time)
- Stored in `checkinSettings.service_times`
- Used for: pre-check-in window, late arrival threshold, security code expiry

#### Breeze Import

Covered fully in Section 1.11.

### 1.10 API Routes

All routes follow the existing Next.js App Router pattern (`src/app/api/[feature]/route.ts`). Auth via Bearer token verified with `src/lib/firebase/admin.ts`. Church ID passed in request body or query param.

---

```
POST /api/checkin/lookup
Auth:    None (kiosk is unauthenticated; rate-limited by IP)
Body:    { church_id: string } & (
           | { qr_token: string }
           | { phone_last4: string }
           | { phone_full: string }
         )
Response:
  {
    households: Array<{
      household: Household
      children: Child[]
    }>
    // empty array = no match found (first-time visitor)
  }
Notes:   For phone_last4, may return multiple households (disambiguation).
         For qr_token, returns exactly 0 or 1 household.
         Children array pre-fetches room names and today's pre-check-in sessions.
```

```
POST /api/checkin/checkin
Auth:    None (kiosk)
Body:
  {
    church_id: string
    household_id: string
    child_ids: string[]           // children being checked in
    room_overrides?: Record<string, string>  // childId → roomId (if room was changed)
    station_id?: string           // printer station ID
    service_date: string          // ISO date
  }
Response:
  {
    sessions: CheckInSession[]    // one per child
    security_code: string         // shared code for this check-in group
    print_results: PrintResult[]  // one per label printed
  }
Logic:
  1. For each child_id:
     a. Resolve room (override or default_room_id)
     b. Check room capacity; warn if at/over (but do not block)
     c. Create CheckInSession with generated security_code
  2. Generate shared security_code for this check-in group
  3. Fire print jobs: N child labels + 1 parent stub (via configured station printer)
  4. If capacity hit: trigger SMS notification (idempotent)
  5. Return sessions + security_code + print_results
```

```
POST /api/checkin/checkout
Auth:    None (kiosk/room device)
Body:
  {
    church_id: string
    session_id: string
    security_code: string         // entered by volunteer
    volunteer_user_id?: string    // if volunteer is logged in
  }
Response:
  { success: boolean, error?: 'code_mismatch' | 'code_expired' | 'already_checked_out' }
Logic:
  1. Load CheckInSession
  2. Verify security_code matches and is not expired
  3. If mismatch: create CheckInAlert, return error
  4. If match: set checked_out_at, checked_out_by_user_id
```

```
POST /api/checkin/print
Auth:    None (kiosk) — accepts session_ids to reprint
Body:
  {
    church_id: string
    session_ids: string[]         // existing sessions to reprint
    station_id?: string
  }
Response:
  { print_results: PrintResult[] }
Notes:   Used for retry after printer-offline failure. Does not re-generate security codes.
```

```
GET /api/checkin/room/[roomId]
Auth:    Token in query param (?token={checkin_view_token})
Query:   date: string (ISO date, defaults to today)
Response:
  {
    room: Pick<Room, 'id' | 'name' | 'capacity'>
    sessions: Array<CheckInSession & {
      child: Pick<Child, 'first_name' | 'last_name' | 'has_alerts' | 'allergies' | 'medical_notes'>
      household: Pick<Household, 'primary_guardian_phone'>
    }>
    service_start_time: string | null  // for late arrival calculation
    server_time: string
  }
Notes:   Read-only. Returns only confirmed check-in sessions for this room+date.
         No auth beyond token validation. Data scoped to room — no cross-room data.
```

```
POST /api/admin/checkin/printer
Auth:    Required — 'owner' | 'admin'
Body:    { church_id: string, printer: Omit<PrinterConfig, 'id'> | PrinterConfig }
Response: { printer: PrinterConfig }
Logic:   Upsert printer in checkinSettings.printers array (match on id if present).
```

```
POST /api/admin/checkin/printer/test
Auth:    Required — 'owner' | 'admin'
Body:    { church_id: string, printer: PrinterConfig }
Response: { success: boolean, error?: string, latency_ms: number }
Logic:   Send a test label to the printer. No Firestore writes.
```

```
GET /api/admin/checkin/report
Auth:    Required — any authenticated user (role: scheduler, admin, owner)
Query:
  church_id: string
  report_type: 'weekly_summary' | 'child_history' | 'first_timers' | 'consistent' | 'lapsed' | 'room_occupancy'
  start_date: string (ISO date)
  end_date: string (ISO date)
  child_id?: string           // for child_history
  room_id?: string            // for room_occupancy
  min_sessions?: number       // for consistent
  lapsed_weeks?: number       // for lapsed
  format?: 'json' | 'csv'     // default: json
Response:
  json: { data: object[], meta: { total: number, generated_at: string } }
  csv:  Content-Type: text/csv, Content-Disposition: attachment
```

```
POST /api/admin/checkin/household
Auth:    Required — 'owner' | 'admin' | 'scheduler'
Body:    { church_id: string, household: Omit<Household, 'id' | 'created_at' | 'updated_at' | 'qr_token'> }
Response: { household: Household }
Logic:   Generate qr_token on creation.
```

```
PUT /api/admin/checkin/household/[householdId]
Auth:    Required — 'owner' | 'admin' | 'scheduler'
Body:    Partial<Household> (cannot update qr_token via this route — use /regenerate-qr)
Response: { household: Household }
```

```
POST /api/admin/checkin/household/[householdId]/regenerate-qr
Auth:    Required — 'owner' | 'admin'
Body:    { church_id: string }
Response: { qr_token: string }
Logic:   Generate new qr_token, update Household document. Old QR code is immediately invalid.
```

```
POST /api/admin/checkin/import/breeze
Auth:    Required — 'owner' | 'admin'
Content-Type: multipart/form-data
Body:    { file: File (CSV), church_id: string, dry_run?: boolean }
Response:
  {
    households_created: number
    households_updated: number
    children_created: number
    children_updated: number
    skipped: number
    errors: Array<{ row: number, reason: string }>
    dry_run: boolean
  }
Logic:   See Section 1.11.
```

### 1.11 Breeze Migration Path

Breeze exports people/family data via **People → Export**. The standard Breeze People export CSV has the following columns (as of 2026):

**Breeze CSV columns used:**

| Breeze Column | Maps to |
|---------------|---------|
| `First Name` | `Child.first_name` |
| `Last Name` | `Child.last_name` or `Household.primary_guardian_name` (see logic) |
| `Nickname` | `Child.preferred_name` |
| `Birthdate` | `Child.date_of_birth` |
| `Grade` | `Child.grade` (via grade mapping, see below) |
| `Family Role` | Determines if row is a child or guardian (`Child`, `Adult`, `Head of Household`) |
| `Mobile` | `Household.primary_guardian_phone` (first adult in family group) |
| `Family ID` | Groups rows into `Household` documents |
| `Person ID` | `Child.external_id` or `Household.external_id` |
| `Tags` | Scan for allergy-related tags (configurable in admin, e.g., tag name contains "allergy") |

**Grade mapping (Breeze → VolunteerCal):**
Breeze stores grades as strings like "Kindergarten", "1st Grade", "2nd Grade", "Nursery", "Toddlers", "Pre-K", "Pre-School". Map these to `ChildGrade` values. Admins can customize the mapping in `checkinSettings.breeze_import_grade_mapping` for non-standard grade labels.

Default mapping:
```typescript
const DEFAULT_BREEZE_GRADE_MAP: Record<string, ChildGrade> = {
  'Nursery': 'nursery',
  'Toddler': 'toddler', 'Toddlers': 'toddler',
  'Pre-K': 'pre-k', 'Pre-School': 'pre-k', 'Preschool': 'pre-k',
  'Kindergarten': 'kindergarten', 'Kinder': 'kindergarten',
  '1st': '1st', '1st Grade': '1st', 'First Grade': '1st',
  '2nd': '2nd', '2nd Grade': '2nd',
  '3rd': '3rd', '3rd Grade': '3rd',
  '4th': '4th', '4th Grade': '4th',
  '5th': '5th', '5th Grade': '5th',
  '6th': '6th', '6th Grade': '6th',
}
```

**Import logic (in `POST /api/admin/checkin/import/breeze`):**

```
1. Parse CSV with papaparse (already in codebase or add: npm install papaparse @types/papaparse)
2. Group rows by Family ID into household groups
3. For each household group:
   a. Identify adults (Family Role = 'Head of Household' or 'Adult')
      - primary_guardian = first adult; secondary_guardian = second adult (if present)
      - If no adults found: skip household, log error
   b. Identify children (Family Role = 'Child')
      - If no children: skip household (no check-in relevance)
   c. Check for existing Household by external_id = Breeze Family ID:
      - Exists: update guardian names/phones (don't overwrite qr_token)
      - Does not exist: create new Household with generated qr_token
   d. For each child row:
      - Check for existing Child by external_id = Breeze Person ID
      - Exists: update name, grade, DOB
      - Does not exist: create new Child linked to household
      - Map grade string through grade mapping table
      - If grade string not found in mapping: log warning, set grade = undefined
   e. Handle allergy tags: if any of the child's Breeze Tags match the church's
      configured allergy tag names, set has_alerts = true and allergies = tag names joined
4. Edge cases:
   - Duplicate child names in same household: create both (Breeze treats them as separate people)
   - Missing DOB: allowed — grade is the primary age signal
   - Child with no Family Role: treat as 'Child' if age < 18 (inferred from DOB), otherwise skip
   - Family ID present but only adults: skip (no children's check-in relevance)
   - Phone number formatting: normalize to E.164 (+1XXXXXXXXXX for US numbers)
5. dry_run: if true, perform all logic and return counts/errors without writing to Firestore
```

**Admin UI for import:**
- `/dashboard/checkin/admin/import`
- Step 1: Upload CSV file, show preview of first 5 rows
- Step 2: Run dry-run import, show "X households, Y children would be created/updated. Z errors."
- Step 3: Review errors (expandable list by row number + reason)
- Step 4: Confirm and run actual import
- Progress bar during import (for large churches, batch in groups of 50 families)

### 1.12 Tier Gating

| Feature | Minimum Tier | Reasoning |
|---------|-------------|-----------|
| Basic check-in (kiosk flow, labels, pickup) | **Growth** | Core feature — requires printer infra and real-time data |
| Room teacher view | Growth | Same tier as check-in |
| Household & child profile management | Growth | Required for check-in to function |
| Pre-check-in SMS flow | **Pro** | Requires scheduled SMS sends; higher infra cost |
| Attendance reporting (basic weekly) | Growth | Core reporting |
| Attendance reporting (trends, lapsed, first-timers) | Pro | Advanced analytics |
| CSV export of attendance | Growth | Standard data portability |
| Breeze CSV import | Growth | Migration feature — unlocks at first paid tier for check-in |
| Multiple kiosk stations (>1 printer) | Pro | Single station at Growth; multi-station at Pro |
| Custom allergy tag mapping | Growth | Required for Breeze migration completeness |

Add to `src/lib/constants/index.ts` TIER_FEATURES:
```typescript
checkin_enabled: ['growth', 'pro', 'enterprise'].includes(tier),
checkin_pre_checkin_sms: ['pro', 'enterprise'].includes(tier),
checkin_advanced_reports: ['pro', 'enterprise'].includes(tier),
checkin_multi_station: ['pro', 'enterprise'].includes(tier),
```

### 1.13 Security & Privacy Considerations

**Data isolation:** Children's records (`households`, `children`, `checkInSessions`) are stored under `churches/{churchId}/` — completely isolated per church. No child data is shared across churches or accessible to other VolunteerCal organizations.

**Security codes:** Codes are 4-character alphanumeric, randomly generated per session. They are **session-scoped** (tied to a specific `service_date` + `CheckInSession`) and expire at `security_code_expires_at`. After expiry, a code cannot be used for checkout — coordinator override required. Codes are never reused.

**Unauthenticated kiosk endpoints:** `/api/checkin/lookup`, `/api/checkin/checkin`, and `/api/checkin/checkout` are intentionally unauthenticated (families don't have VolunteerCal accounts). Protect these endpoints with:
- **IP-based rate limiting**: max 30 requests/min per IP (use `src/lib/middleware/rateLimit.ts` — create if not exists)
- **Church ID scoping**: all requests must supply a valid `church_id`; only data for that church is returned
- **No PII in lookup responses**: phone lookup returns first names + grade only — never full phone numbers, addresses, or medical details

**Teacher view token:** The `/checkin/room/[roomId]` page is protected by a `checkin_view_token` on the Room document. This token is long (16-byte hex = 32 chars), unguessable, and regeneratable by admins if a device is lost. No personal logins needed for teachers.

**Medical data:** `Child.allergies` and `Child.medical_notes` are stored in Firestore but:
- Not returned by the lookup API (Screen 1-2 of kiosk flow)
- Only returned after check-in confirmation (Screen 3 alert acknowledgment) and in the teacher room view
- The kiosk only shows allergy data **at the moment of check-in** and in the teacher view — not browsable by random visitors

**COPPA note:** VolunteerCal stores family and children's data **on behalf of the church** (data processor role, not data controller). The church is responsible for obtaining parental consent for data collection. VolunteerCal's privacy policy should reflect the data processor relationship. Children's data is never used for VolunteerCal's own analytics, advertising, or shared with third parties.

**Firestore security rules for check-in collections:**

```
// Households: admin read/write; kiosk reads only via API routes (not direct client)
match /churches/{churchId}/households/{householdId} {
  allow read, write: if hasOrgRole(churchId, ['owner', 'admin', 'scheduler']);
}

// Children: same as households
match /churches/{churchId}/children/{childId} {
  allow read, write: if hasOrgRole(churchId, ['owner', 'admin', 'scheduler']);
}

// CheckInSessions: admin write; teacher view reads via API (no direct client access)
match /churches/{churchId}/checkInSessions/{sessionId} {
  allow read: if hasOrgRole(churchId, ['owner', 'admin', 'scheduler']);
  allow write: if hasOrgRole(churchId, ['owner', 'admin', 'scheduler']);
  // Teacher room view reads are handled server-side (API validates token, queries Admin SDK)
  // No direct client reads on this collection outside of admin roles
}

// CheckIn settings: admin only
match /churches/{churchId}/checkinSettings/{doc} {
  allow read: if hasOrgRole(churchId, ['owner', 'admin', 'scheduler']);
  allow write: if hasOrgRole(churchId, ['owner', 'admin']);
}

// CheckIn alerts: admin read, write via API only
match /churches/{churchId}/checkinAlerts/{alertId} {
  allow read: if hasOrgRole(churchId, ['owner', 'admin']);
  allow write: if false;  // write-only via Admin SDK in API routes
}
```

---

## Part 2: Room & Resource Scheduling

### 2.1 Feature Overview & Goals

Room/Resource Scheduling adds a facility booking layer to VolunteerCal. Churches currently manage room bookings via spreadsheets, whiteboard calendars, or separate tools (EMS, 25Live, Google Calendar). This feature brings room booking into VolunteerCal so volunteer scheduling and space reservation live in the same system.

**Goals:**
- Allow any authorized user to reserve rooms/spaces for events or ministry activities
- Auto-suggest relevant volunteer roles/teams based on the room selected
- Support recurring reservations (perpetual and date-bounded)
- Handle conflicts via admin approval rather than hard blocks
- Provide a public-facing room display page for mounted tablets
- Generate iCal subscription feeds per room, per ministry, and church-wide
- Provide an embeddable public calendar for the church's website

**What this is NOT:**
- A full facilities management system (no work orders, maintenance requests, or custodial scheduling)
- A hot-desk or hot-office booking system
- A ticketing or event registration system

### 2.2 Admin Setup: Rooms & Resources Management

**Route:** `/dashboard/rooms` (new top-level dashboard section)
**Permission:** Only `owner` or `admin` can create/edit/delete rooms. All authenticated users can view rooms.

Rooms are defined by admins before anyone can make reservations. Each room is a persistent resource that lives in Firestore and can be reserved repeatedly.

**Room definition includes:**
- Name (required): "Sanctuary", "Fellowship Hall", "Room 101", "Gym", "Youth Room"
- Description (optional): Free text about the space
- Capacity (optional): Max number of people
- Location/Building (optional): For multi-building campuses — maps to `campus_ids` in existing campus subcollection
- Equipment list: Multi-select from org-defined equipment tags (projector, sound system, piano, kitchenette, chairs/tables, A/V rack, stage lighting, etc.)
- Photo: Upload to Firebase Storage (follow existing `src/lib/firebase/storage.ts` pattern)
- Suggested teams: Pre-selected ministry IDs that auto-populate when this room is chosen in a booking form (e.g., Sanctuary auto-suggests Sound, Lighting, Media ministries)
- Active/inactive flag: Soft delete — inactive rooms don't appear in booking forms

**Admin creates org-level equipment tag list** (stored in `churches/{churchId}/room_settings`, a single config document) — admins define the org's equipment vocabulary once, then rooms select from that list.

### 2.3 Booking Flow with PCO-Style Checklist

**Route for creating a reservation:** Modal overlay or slide-out panel, triggered from:
- The room list page: "Reserve" button on each room card
- The calendar view: Click an empty time slot on a room's lane
- The dashboard quick-action button: "Reserve a Room"

**Booking form — PCO-style checklist flow (multi-step):**

**Step 1: Room & Time**
- Select room (required) — shows photo, capacity, equipment tags for reference
- Title / Event name (required)
- Description (optional)
- Ministry (optional — associates reservation with a ministry for filtering/reporting)
- Date (required)
- Start time (required)
- End time (required)
- Expected attendance (optional number input — shown against room capacity)

**Step 2: Recurrence** (can skip for one-time)
- Is this recurring? (toggle)
- If yes: Recurrence picker (see Section 2.4)

**Step 3: Equipment & Setup Checklist**
- Equipment needed: Multi-select checkboxes pre-populated from the room's equipment list. Admin can add items not on the room's list.
- Setup notes (optional free text): Special configuration notes, seating arrangement requests, etc.

**Step 4: Teams & Volunteers Needed**
- This step auto-populates based on the selected room's `suggested_teams` list
- Shows checkboxes for each suggested ministry/team with their name and icon
- User can uncheck suggested teams or add additional teams not auto-suggested
- "Number of volunteers needed per team" — optional numeric input per team
- This data is stored on the reservation for informational purposes; it does NOT automatically create assignments (that would require full integration with the scheduling engine, which is a future feature)
- A note in the UI: "Adding teams here notifies the ministry leader but does not automatically schedule volunteers."

**Step 5: Review & Submit**
- Summary of all selections
- Shows conflict indicator if time overlaps with another reservation (real-time Firestore check)
- If conflict: Yellow warning box appears: "This time overlaps with [Event Name] by [Ministry]. Submitting will create a reservation request for admin approval."
- If no conflict: Submit button text is "Confirm Reservation"
- If conflict: Submit button text is "Submit for Approval"

### 2.4 Recurring Reservations

Recurring reservation logic is similar to the existing `RecurrencePattern` type on services, but extended for room booking needs.

```typescript
type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly_by_date' | 'monthly_by_weekday'

type RecurrenceEndType = 'never' | 'until_date' | 'count'

interface RecurrenceRule {
  frequency: RecurrenceFrequency
  interval: number                   // every N periods (usually 1 or 2)
  days_of_week?: number[]            // 0=Sunday...6=Saturday (for weekly/biweekly)
  monthly_week?: number              // 1-5 (for monthly_by_weekday: "2nd Sunday")
  monthly_weekday?: number           // 0-6 (for monthly_by_weekday)
  end_type: RecurrenceEndType
  end_date?: string                  // ISO date (for until_date)
  count?: number                     // number of occurrences (for count)
}
```

**Recurrence patterns supported:**

| Pattern | Example | frequency | Configuration |
|---------|---------|-----------|---------------|
| Weekly same day | Every Sunday | weekly | days_of_week: [0] |
| Weekly multiple days | Every Mon & Wed | weekly | days_of_week: [1, 3] |
| Biweekly | Every other Sunday | biweekly | days_of_week: [0] |
| Monthly by date | 1st of every month | monthly_by_date | — |
| Monthly by weekday | 2nd Sunday of month | monthly_by_weekday | monthly_week: 2, monthly_weekday: 0 |
| Daily | Every day | daily | — |

**End conditions:**
- Never (perpetual): Recurs indefinitely; individual instances can be cancelled
- Until date: Last occurrence on or before end_date
- Count: Fixed number of occurrences

**Editing recurring reservations — "this and following" model:**

When a user edits a recurring reservation, present a modal:
> "How would you like to apply this change?"
> ○ Just this occurrence
> ○ This and all following occurrences
> ○ All occurrences (including past)

This follows the same `EditScope` type already in `src/lib/types/index.ts` (`'single_date' | 'from_date' | 'next'`).

**Implementation approach:** Store recurring reservations as:
1. One parent document with the recurrence rule
2. Individual child documents per occurrence (generated eagerly for the next 52 weeks, then re-generated on a cron job)

This "materialized occurrences" approach (vs. virtual generation) is simpler for Firestore queries, conflict detection, and iCal generation. It matches the approach the existing scheduler uses for service occurrences.

**Parent reservation has:** `recurrence_rule`, `is_recurring: true`, `recurrence_parent_id: null`
**Child reservation has:** `recurrence_parent_id` pointing to parent, `recurrence_index` (0-based occurrence number), `is_recurring: true`

Cancelling "this and following" sets `recurrence_end_override` on the parent document and deletes all child documents with `recurrence_index >= current_index`.

### 2.5 Conflict Detection & Request/Approval Flow

**Conflict definition:** Two reservations conflict when they share the same `room_id` and their time ranges overlap (start/end datetime comparison, exclusive of exact boundary touches — back-to-back reservations are allowed).

**No hard blocks.** A conflict does not prevent submission. Instead:
1. The booking form warns the user in real-time (Step 5 of booking flow)
2. On submit, if a conflict exists, the reservation is saved with `status: 'pending_approval'`
3. A `ReservationRequest` document is created linking the new reservation to the conflicting reservation(s)
4. Admin receives SMS + in-app notification: "Reservation conflict: [Title] by [Ministry] overlaps with [Existing Title] on [Date]. Review required."
5. Admin sees both reservations side by side in the conflict review interface

**Conflict review UI** (`/dashboard/rooms/requests`):

Each pending request shows:
- Left card: New reservation (requesting)
- Right card: Existing conflicting reservation(s)
- Side-by-side comparison: title, ministry, time, equipment needed, expected attendance
- Admin actions: "Approve" (with optional note) | "Deny" (required note/reason)
- On approval: new reservation `status` → `'confirmed'`; conflicting reservation stays `'confirmed'` (both exist — this is intentional; the admin is acknowledging the overlap and deciding to allow it)
- On denial: new reservation `status` → `'denied'`; requester notified via SMS + in-app with admin note

**Notification on decision** (follow existing Twilio SMS + sent_notifications pattern in `src/lib/services/sms.ts`):
- Approval: "Your reservation for [Title] on [Date] at [Time] in [Room] has been approved."
- Denial: "Your reservation request for [Title] on [Date] was not approved. Note from admin: [admin_note]"

**Status flow diagram:**
```
New reservation (no conflict)    → status: 'confirmed'
New reservation (conflict)       → status: 'pending_approval' → (admin approves) → 'confirmed'
                                                               → (admin denies)  → 'denied'
User cancels confirmed           → status: 'cancelled'
```

### 2.6 Room Display (Tablet/Kiosk Mode)

**Route:** `/display/room/[roomId]`
**Auth:** None required — fully public, read-only page.
**Purpose:** Mounted on a tablet or display outside each room to show current/upcoming reservations.

**URL structure:** `https://app.volunteercal.com/display/room/{roomId}`

Each room's display URL is shown in the admin room detail page with a "Copy display link" button and a QR code for easy setup on new tablets.

**Display page layout (landscape-optimized, full-screen):**

```
┌─────────────────────────────────────────────────────────────────┐
│  Room Name (top-left, medium text)         Clock (top-right)    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                   CURRENTLY IN USE                              │
│              ██████████████████████████                         │
│                  [EVENT TITLE]                                  │
│             [Ministry Name]  |  ends at [Time]                  │
│                 [Time remaining countdown]                       │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  UPCOMING TODAY                                                  │
│  [Next Event]  [Ministry]  [Start Time] – [End Time]            │
│  [Event after]  [Ministry]  [Start Time] – [End Time]           │
└─────────────────────────────────────────────────────────────────┘
```

**Visual states:**
- **Active reservation (current time is within start–end):** Green accent, large text, countdown timer showing time remaining
- **No current reservation:** Grey/muted "Available" state, shows next upcoming reservation prominently
- **No upcoming reservations today:** "Available — No reservations scheduled today"

**Technical implementation:**
- Next.js Server Component for the page shell, client component for the real-time data
- Use Firestore `onSnapshot` listener (real-time) on `churches/{churchId}/reservations` filtered by `room_id` and `start_time >= today midnight`
- No authentication check on this route — Firestore security rules should allow public read on reservations for display purposes (add a `display_public: true` flag to the Room document and update Firestore rules to allow reads for rooms where `display_public == true`)
- Auto-full-screen: Add a `useEffect` that calls `document.documentElement.requestFullscreen()` on first user interaction (browser policy requires a user gesture)
- CSS: Force `landscape` orientation with `@media (orientation: portrait)` showing a "Please rotate device" message

**Page metadata:**
- `<title>{room.name} — Room Display</title>`
- `<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">`
- Disable the Next.js navbar/sidebar layout — this page uses a completely blank layout

**Create a new layout file:** `src/app/display/layout.tsx` — renders `{children}` with no nav, no sidebar, `overflow: hidden`, black background.

### 2.7 iCal / Calendar Subscription Feeds

The existing `src/lib/utils/ical.ts` already generates iCalendar format for volunteer schedules. Extend it (or create a new utility) for room/reservation feeds.

**New API routes:**

**Room-specific iCal feed:**
```
Method:  GET
Path:    /api/calendar/room/[roomId].ics
Auth:    None required (public feed with opaque room token in URL for obscurity)
         Actual URL: /api/calendar/room/[roomId]/[calendarToken].ics
         where calendarToken is stored on the Room document (random 32-char string, regeneratable)
Response:
  Content-Type: text/calendar
  Content-Disposition: inline; filename="{room-name}-calendar.ics"
  Body: iCalendar (RFC 5545) format

iCal event fields per reservation:
  SUMMARY:    {reservation.title}
  DESCRIPTION: {reservation.description} + "Teams needed: {teams_needed}" + "Equipment: {equipment_needed}"
  LOCATION:   {room.name} — {room.location}
  DTSTART:    {reservation.start_time} (in room's campus timezone)
  DTEND:      {reservation.end_time}
  ORGANIZER:  {requesting volunteer or ministry name}
  UID:        {reservation.id}@volunteercal.app
  STATUS:     CONFIRMED (only include confirmed reservations, exclude pending/denied/cancelled)
```

**Church-wide iCal feed:**
```
Method:  GET
Path:    /api/calendar/church/[churchId]/[calendarToken].ics
Auth:    None (obscured by token)
Response: All confirmed reservations across all rooms for the church
```

**Ministry-specific iCal feed:**
```
Method:  GET
Path:    /api/calendar/ministry/[ministryId]/[calendarToken].ics
Auth:    None (obscured by token)
Response: All confirmed reservations where reservation.ministry_id === ministryId
```

**Calendar token management:**

Add a `calendar_token` field to the Room document and to `churches/{churchId}` (for the church-wide feed). Tokens are generated on creation and can be regenerated by admins (invalidates old subscriptions). Show the iCal URL in the admin UI with a copy button and a "Regenerate link" option.

**iCal format reminder (RFC 5545):**
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//VolunteerCal//Room Calendar//EN
CALSCALE:GREGORIAN
X-WR-CALNAME:{Room Name} — {Church Name}
X-WR-TIMEZONE:{church timezone}
BEGIN:VEVENT
...
END:VEVENT
END:VCALENDAR
```

Study `src/lib/utils/ical.ts` for the existing iCal generation pattern and extend it for reservations.

### 2.8 Embedded Calendar View

**Routes:**
- `/calendar` — Authenticated member-facing calendar (requires login)
- `/calendar/public` — Public-facing church schedule (no login required)

Both routes render the same calendar component with different data access levels:
- Authenticated: All confirmed + pending reservations visible; shows ministry and requester name
- Public: Only confirmed reservations where the Room has `public_visible: true`

**Calendar component: `RoomCalendarView`**

This is a purpose-built calendar grid (not a third-party library — keep it simple, consistent with existing Tailwind v4 design). Three views:
1. **Month view** — Grid of days; each day shows colored dots/chips for reservations
2. **Week view** — 7-column grid with time lanes; reservations rendered as colored blocks
3. **Day view** — Single-day time lane; full reservation details in each block

**Filters (top bar):**
- Filter by room (multi-select dropdown)
- Filter by ministry (multi-select dropdown)
- Filter by date range (for month view: navigate months; for week/day: navigate weeks/days)
- "Today" shortcut button

**Color coding:**
- Each ministry has a `color` field in the `ministries` subcollection — use that color for reservation blocks
- Reservations with no associated ministry: neutral grey

**Embed mode:**

The `/calendar/public` route supports an `?embed=true` query parameter that:
- Hides all navigation (no VolunteerCal header/footer)
- Hides all action buttons
- Renders only the calendar grid + filters
- Adds `X-Frame-Options: ALLOW-FROM` and `Content-Security-Policy: frame-ancestors *` headers

Church admins can embed the public calendar on their own website with an iframe:
```html
<iframe src="https://app.volunteercal.com/calendar/public?embed=true"
        width="100%" height="700px" frameborder="0">
</iframe>
```

The embed URL is displayed in the admin settings with a copy button.

### 2.9 Firestore Data Models (Full Schema)

**New subcollection:** `churches/{churchId}/rooms`

```typescript
// Document: churches/{churchId}/rooms/{roomId}
interface Room {
  id: string
  church_id: string
  name: string                          // "Sanctuary", "Fellowship Hall"
  description?: string
  capacity?: number                     // max people
  location?: string                     // "Main Building, 1st Floor"
  campus_id?: string                    // links to churches/{churchId}/campus/{campusId}
  equipment: string[]                   // ["projector", "sound_system", "piano"]
  photo_url?: string                    // Firebase Storage URL
  suggested_ministry_ids: string[]      // auto-populated in booking form
  is_active: boolean                    // soft delete
  display_public: boolean               // allow public display URL
  public_visible: boolean               // show on public calendar
  calendar_token: string                // 32-char random string for iCal URL
  created_by: string                    // user_id
  created_at: string                    // ISO datetime
  updated_at: string                    // ISO datetime
}
```

**New subcollection:** `churches/{churchId}/room_settings`

```typescript
// Document: churches/{churchId}/room_settings/config  (single doc)
interface RoomSettings {
  equipment_tags: string[]              // org-defined vocabulary: ["projector", "sound_system", ...]
  default_reservation_duration_minutes: number  // default end time offset (e.g., 60)
  require_ministry_on_reservations: boolean
  conflict_notification_user_ids: string[]  // users to notify on conflict
  updated_by: string
  updated_at: string
}
```

**New subcollection:** `churches/{churchId}/reservations`

```typescript
// Document: churches/{churchId}/reservations/{reservationId}
interface Reservation {
  id: string
  church_id: string
  room_id: string
  title: string
  description?: string
  ministry_id?: string
  requested_by_user_id: string          // user_id of requester
  requested_by_volunteer_id?: string    // volunteer_id if linked
  start_time: string                    // ISO datetime (UTC stored, display in campus TZ)
  end_time: string                      // ISO datetime (UTC stored)

  // Recurrence
  is_recurring: boolean
  recurrence_rule?: RecurrenceRule      // only on parent document
  recurrence_parent_id?: string         // null for parent, parent ID for children
  recurrence_index?: number             // 0-based occurrence index
  recurrence_end_override?: string      // ISO date — overrides parent's recurrence rule end

  // Status & approval
  status: ReservationStatus             // 'confirmed' | 'pending_approval' | 'denied' | 'cancelled'

  // Equipment & teams
  equipment_needed: string[]            // from room's equipment list
  teams_needed: string[]                // ministry IDs
  expected_attendance?: number
  setup_notes?: string

  // Conflict tracking
  conflict_with_ids: string[]           // reservation IDs this conflicts with

  // Approval metadata
  approved_by?: string                  // user_id
  approved_at?: string                  // ISO datetime
  denied_by?: string                    // user_id
  denied_at?: string                    // ISO datetime
  denied_reason?: string

  created_at: string
  updated_at: string
}

type ReservationStatus = 'confirmed' | 'pending_approval' | 'denied' | 'cancelled'

type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly_by_date' | 'monthly_by_weekday'

type RecurrenceEndType = 'never' | 'until_date' | 'count'

interface RecurrenceRule {
  frequency: RecurrenceFrequency
  interval: number
  days_of_week?: number[]
  monthly_week?: number
  monthly_weekday?: number
  end_type: RecurrenceEndType
  end_date?: string
  count?: number
}
```

**New subcollection:** `churches/{churchId}/reservation_requests`

```typescript
// Document: churches/{churchId}/reservation_requests/{requestId}
interface ReservationRequest {
  id: string
  church_id: string
  new_reservation_id: string            // the reservation being requested
  conflicting_reservation_ids: string[] // existing reservations it conflicts with
  status: 'pending' | 'approved' | 'denied'
  admin_note?: string
  reviewed_by?: string                  // user_id
  reviewed_at?: string                  // ISO datetime
  notified_at?: string                  // when requester was notified
  created_at: string
}
```

**Type additions to `src/lib/types/index.ts`:**

```typescript
// Add to existing types file:

export type ReservationStatus = 'confirmed' | 'pending_approval' | 'denied' | 'cancelled'
export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly_by_date' | 'monthly_by_weekday'
export type RecurrenceEndType = 'never' | 'until_date' | 'count'
export type ReservationRequestStatus = 'pending' | 'approved' | 'denied'

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  interval: number
  days_of_week?: number[]
  monthly_week?: number
  monthly_weekday?: number
  end_type: RecurrenceEndType
  end_date?: string
  count?: number
}

export interface Room {
  id: string
  church_id: string
  name: string
  description?: string
  capacity?: number
  location?: string
  campus_id?: string
  equipment: string[]
  photo_url?: string
  suggested_ministry_ids: string[]
  is_active: boolean
  display_public: boolean
  public_visible: boolean
  calendar_token: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface Reservation {
  id: string
  church_id: string
  room_id: string
  title: string
  description?: string
  ministry_id?: string
  requested_by_user_id: string
  requested_by_volunteer_id?: string
  start_time: string
  end_time: string
  is_recurring: boolean
  recurrence_rule?: RecurrenceRule
  recurrence_parent_id?: string
  recurrence_index?: number
  recurrence_end_override?: string
  status: ReservationStatus
  equipment_needed: string[]
  teams_needed: string[]
  expected_attendance?: number
  setup_notes?: string
  conflict_with_ids: string[]
  approved_by?: string
  approved_at?: string
  denied_by?: string
  denied_at?: string
  denied_reason?: string
  created_at: string
  updated_at: string
}

export interface ReservationRequest {
  id: string
  church_id: string
  new_reservation_id: string
  conflicting_reservation_ids: string[]
  status: ReservationRequestStatus
  admin_note?: string
  reviewed_by?: string
  reviewed_at?: string
  notified_at?: string
  created_at: string
}

export interface RoomSettings {
  equipment_tags: string[]
  default_reservation_duration_minutes: number
  require_ministry_on_reservations: boolean
  conflict_notification_user_ids: string[]
  updated_by: string
  updated_at: string
}
```

**New Firestore composite indexes needed** (add to `firestore.indexes.json`):

```json
{
  "collectionGroup": "reservations",
  "queryScope": "Collection",
  "fields": [
    { "fieldPath": "room_id", "order": "ASCENDING" },
    { "fieldPath": "start_time", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "reservations",
  "queryScope": "Collection",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "start_time", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "reservations",
  "queryScope": "Collection",
  "fields": [
    { "fieldPath": "ministry_id", "order": "ASCENDING" },
    { "fieldPath": "start_time", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "reservation_requests",
  "queryScope": "Collection",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "created_at", "order": "DESCENDING" }
  ]
}
```

### 2.10 API Routes Needed

All routes follow the existing pattern: Bearer token in `Authorization` header, verified via `src/lib/firebase/admin.ts`.

**Rooms:**

```
GET    /api/rooms
  Auth: Required (any role)
  Query: church_id, include_inactive?
  Response: { rooms: Room[] }

POST   /api/rooms
  Auth: Required, role: 'owner' | 'admin'
  Body: Omit<Room, 'id' | 'created_at' | 'updated_at' | 'calendar_token'>
  Response: { room: Room }
  Logic: Generate calendar_token (crypto.randomBytes(16).toString('hex')), set created_at

GET    /api/rooms/[roomId]
  Auth: Required (any role)
  Query: church_id
  Response: { room: Room }

PUT    /api/rooms/[roomId]
  Auth: Required, role: 'owner' | 'admin'
  Body: Partial<Room>
  Response: { room: Room }

DELETE /api/rooms/[roomId]
  Auth: Required, role: 'owner' | 'admin'
  Logic: Soft delete — set is_active: false. Do NOT delete existing reservations.
  Response: { success: true }

POST   /api/rooms/[roomId]/regenerate-token
  Auth: Required, role: 'owner' | 'admin'
  Logic: Generate new calendar_token, update Room document
  Response: { calendar_token: string }
```

**Room Settings:**

```
GET    /api/rooms/settings
  Auth: Required (any role)
  Query: church_id
  Response: { settings: RoomSettings }

PUT    /api/rooms/settings
  Auth: Required, role: 'owner' | 'admin'
  Body: Partial<RoomSettings>
  Response: { settings: RoomSettings }
```

**Reservations:**

```
GET    /api/reservations
  Auth: Required (any role)
  Query:
    church_id: string (required)
    room_id?: string
    ministry_id?: string
    start_date?: string (ISO date)
    end_date?: string (ISO date)
    status?: ReservationStatus | 'all'
  Response: { reservations: Reservation[] }
  Note: Returns only confirmed + pending by default. Pass status=all for admin views.

POST   /api/reservations
  Auth: Required (any role — any authenticated user can make a reservation)
  Body: Omit<Reservation, 'id' | 'created_at' | 'updated_at' | 'status' | 'conflict_with_ids' | 'approved_*' | 'denied_*'>
  Logic:
    1. Check for conflicts (same room_id, overlapping start/end times)
    2. If no conflict: status = 'confirmed'
    3. If conflict: status = 'pending_approval', create ReservationRequest document
    4. If is_recurring: generate child occurrences (see recurrence generation logic below)
    5. Send notifications
  Response: { reservation: Reservation, has_conflict: boolean, request_id?: string }

GET    /api/reservations/[reservationId]
  Auth: Required (any role)
  Response: { reservation: Reservation }

PUT    /api/reservations/[reservationId]
  Auth: Required
  Body: Partial<Reservation> + { edit_scope: EditScope }
  Auth rule: requester can edit their own; admin can edit any
  Logic: Handle 'single_date' | 'from_date' | 'next' scope for recurring
  Response: { reservation: Reservation, affected_count: number }

DELETE /api/reservations/[reservationId]
  Auth: Required
  Query: edit_scope: EditScope, church_id
  Logic: Set status = 'cancelled' (soft delete); handle recurring scope
  Response: { cancelled_count: number }
```

**Reservation Requests (conflict approval):**

```
GET    /api/reservation-requests
  Auth: Required, role: 'owner' | 'admin'
  Query: church_id, status?: 'pending' | 'approved' | 'denied'
  Response: { requests: ReservationRequest[], reservations: Reservation[] }
  Note: Eager-load all related Reservation documents in the same response

POST   /api/reservation-requests/[requestId]/approve
  Auth: Required, role: 'owner' | 'admin'
  Body: { church_id: string, admin_note?: string }
  Logic:
    1. Set ReservationRequest.status = 'approved'
    2. Set Reservation.status = 'confirmed', approved_by, approved_at
    3. Send SMS + in-app notification to requester
  Response: { success: true }

POST   /api/reservation-requests/[requestId]/deny
  Auth: Required, role: 'owner' | 'admin'
  Body: { church_id: string, admin_note: string }  // admin_note REQUIRED on denial
  Logic:
    1. Set ReservationRequest.status = 'denied'
    2. Set Reservation.status = 'denied', denied_by, denied_at, denied_reason
    3. Send SMS + in-app notification to requester with admin_note
  Response: { success: true }
```

**Public Display:**

```
GET    /api/display/room/[roomId]
  Auth: None (public)
  Query: church_id (or derived from roomId — rooms are globally unique in Firestore)
  Response:
    {
      room: Pick<Room, 'id' | 'name' | 'location'>,
      current: Reservation | null,      // currently active reservation
      upcoming_today: Reservation[],    // upcoming reservations today, sorted by start_time
      server_time: string               // ISO datetime for client clock sync
    }
  Note: Only returns confirmed reservations. Minimal data (no requester PII).
  Firestore security rules: Allow read if room.display_public === true
```

**iCal Feeds:**

```
GET    /api/calendar/room/[roomId]/[calendarToken].ics
  Auth: None (obscured by token)
  Logic: Validate token matches rooms/{roomId}.calendar_token, generate iCal

GET    /api/calendar/church/[churchId]/[calendarToken].ics
  Auth: None (obscured by token)

GET    /api/calendar/ministry/[ministryId]/[calendarToken].ics
  Auth: None (obscured by token)
```

**Recurrence generation utility** (internal, not an API route):

```typescript
// src/lib/utils/recurrence.ts

/**
 * Generate all occurrence dates for a recurrence rule starting from start_date.
 * Returns ISO date strings up to maxDate (default: 1 year from today).
 */
function generateOccurrenceDates(
  startDate: Date,
  rule: RecurrenceRule,
  maxDate?: Date
): Date[]

/**
 * Given a parent reservation, create child Reservation documents for all
 * occurrences up to maxDate. Write to Firestore in a batch.
 */
async function materializeRecurringReservations(
  parentReservation: Reservation,
  churchId: string,
  maxDate?: Date
): Promise<string[]>  // returns array of created reservation IDs
```

### 2.11 UI Components Needed

All new components live in `src/components/rooms/`. Follow the shadcn/ui + Tailwind v4 patterns in `src/components/ui/`.

**`RoomCard` (`src/components/rooms/RoomCard.tsx`)**
```
Props:
  room: Room
  onReserve?: () => void
  showActions?: boolean

Renders: Photo (or placeholder icon), room name, capacity badge, equipment tags,
         "Reserve" button, "View Calendar" link, "Edit" link (admin only).
Variants: 'grid' (card layout) | 'list' (horizontal row)
```

**`RoomBookingForm` (`src/components/rooms/RoomBookingForm.tsx`)**
```
Props:
  churchId: string
  initialRoomId?: string        // pre-selected room
  initialDate?: string          // pre-selected date (from calendar click)
  onSuccess?: (reservation: Reservation) => void
  onCancel?: () => void

Multi-step wizard (5 steps, see Section 2.3).
State: uses useReducer for form state across steps.
Real-time conflict detection: debounced Firestore query on step 5 whenever start_time/end_time/room_id changes.
```

**`RecurrenceRulePicker` (`src/components/rooms/RecurrenceRulePicker.tsx`)**
```
Props:
  value?: RecurrenceRule
  onChange: (rule: RecurrenceRule | null) => void

Renders:
  - Toggle: "One-time" / "Recurring"
  - If recurring:
    - Frequency dropdown (daily / weekly / biweekly / monthly)
    - Day-of-week selector (checkboxes, for weekly/biweekly)
    - Month recurrence type (by date / by weekday, for monthly)
    - End condition radio: Never / Until date / After N occurrences
    - Summary text: "Repeats every Sunday until December 31, 2026 (42 occurrences)"
```

**`ReservationConflictModal` (`src/components/rooms/ReservationConflictModal.tsx`)**
```
Props:
  newReservation: Partial<Reservation>
  conflictingReservations: Reservation[]
  onProceed: () => void   // submit as pending_approval
  onCancel: () => void

Renders two cards side by side:
  Left: New reservation summary
  Right: Each conflicting reservation summary
Explains that submitting will create an approval request.
```

**`ReservationRequestCard` (`src/components/rooms/ReservationRequestCard.tsx`)**
```
Props:
  request: ReservationRequest
  newReservation: Reservation
  conflictingReservations: Reservation[]
  onApprove: (note?: string) => void
  onDeny: (reason: string) => void

Side-by-side comparison layout.
Approve button (optional note input).
Deny button (required reason textarea).
```

**`RoomDisplayPage` (`src/components/rooms/RoomDisplayPage.tsx`)**
```
Props:
  room: Pick<Room, 'id' | 'name' | 'location'>
  initialData: { current: Reservation | null, upcoming_today: Reservation[] }
  serverTime: string

Client component.
Uses Firestore onSnapshot for real-time updates.
Shows clock (updates every second via setInterval).
Full-screen layout, no navigation.
Auto-scrolls upcoming list.
```

**`RoomCalendarView` (`src/components/rooms/RoomCalendarView.tsx`)**
```
Props:
  churchId: string
  isPublic?: boolean     // hides private details when true
  isEmbed?: boolean      // strips nav chrome when true
  initialView?: 'month' | 'week' | 'day'

Views: month / week / day (tab switcher)
Filters: room multi-select, ministry multi-select
Renders reservations as colored blocks using ministry.color
Click on reservation: shows reservation detail popover
"Reserve" button (hidden when isPublic or isEmbed)
```

**`RoomReservationTimeline` (`src/components/rooms/RoomReservationTimeline.tsx`)**
```
Props:
  room: Room
  reservations: Reservation[]
  date: string   // ISO date

Day-view timeline for a single room.
Time slots from 6am–11pm displayed as rows.
Reservations rendered as colored blocks with event title.
Used inside the admin room detail page.
```

### 2.12 Tier Gating Recommendation

| Feature | Minimum Tier | Reasoning |
|---------|-------------|-----------|
| Room management (CRUD) | Starter | Foundational — basic churches need this |
| Create reservations (one-time) | Starter | Core booking functionality |
| Recurring reservations | Growth | More complex use case, power users |
| Conflict approval workflow | Starter | Required for any real-world booking |
| Room display page (kiosk) | Starter | High value, simple implementation |
| iCal subscription feeds (room + church) | Starter | Standard utility |
| Ministry-specific iCal feed | Growth | Segmented by ministry — power feature |
| Public embedded calendar | Growth | Church website integration — marketing value |
| Multiple rooms (no limit) | Growth | Free: 3 rooms, Starter: 10 rooms, Growth+: unlimited |

Add to `src/lib/constants/index.ts` TIER_FEATURES:
```typescript
rooms_max: { free: 0, starter: 10, growth: -1, pro: -1, enterprise: -1 },
// -1 = unlimited; 0 = feature disabled
rooms_recurring_reservations: ['growth', 'pro', 'enterprise'],
rooms_public_calendar: ['growth', 'pro', 'enterprise'],
rooms_ministry_ical: ['growth', 'pro', 'enterprise'],
```

---

## Part 3: WorshipTools UI/UX Insights

This section synthesizes WorshipTools' design patterns from direct research of their documentation. It is prescriptive — each subsection ends with a specific recommendation for VolunteerCal.

### 3.1 Roles Architecture

**How WorshipTools does it:**

Roles in WorshipTools are organization-wide and grouped into "Role Groups." A Role Group is a named collection of related roles (e.g., "Worship Team" contains Vocals, Guitar, Bass, Drums, Keys; "Tech Team" contains Sound, Lighting, Media, Video). Roles are reused across all services — you define them once and assign people from any service's scheduling view.

A person can have multiple roles simultaneously. Role assignment is done at the person level (not per-service) — you set `Person → Roles: [Vocals, Keys]` once, and that person is available in either role for any service.

**What WorshipTools lacks (and VolunteerCal has):**
- No per-role hierarchy (no Primary / Backup distinction within a role)
- No auto-assignment algorithm — WorshipTools is fully manual scheduling

**Recommendation for VolunteerCal:**

VolunteerCal already has this covered architecturally (`role_ids[]` on volunteers, `RoleSlot[]` on services). Two patterns worth adopting:

1. **Role Groups in the scheduling UI:** VolunteerCal's schedule matrix should group roles visually by ministry (which serves the same function as WorshipTools' Role Groups). The `schedule-matrix.tsx` component should render role slots grouped under their `ministry_id` header, collapsible per group. This reduces cognitive load when a service has 15+ roles.

2. **Role assignment at the person level, not just per-service:** Ensure the volunteer profile UI (`/dashboard/volunteers/{id}`) has a prominent "Assigned Roles" section that functions as the source of truth, and the service assignment UI uses that as the eligible pool. This is already architecturally correct but the UI should make it obvious.

### 3.2 Schedule Display Patterns

**How WorshipTools does it:**

WorshipTools' "Scheduling Matrix" shows up to 4 services simultaneously in a column-based grid. Each service is a column; rows are Role Groups (collapsible) then individual roles within each group. An "+ Add Person" button sits in each cell. Unavailable people appear greyed out in the person-picker dropdown, not hidden — schedulers can still see them but visually understand they're blocked.

**What's worth adapting:**

1. **"Greyed out, not hidden" pattern for unavailability:** When a scheduler is assigning someone to a role, people with availability conflicts (blockout dates, recurring unavailability) should appear in the picker but visually deprioritized — grey name, strike-through, or a ⚠ icon — rather than being hidden from the list. This lets schedulers make informed exceptions when needed (emergency coverage) while making the constraint obvious. This is better than silently filtering them out.

2. **Batched "Send Notifications" pattern:** WorshipTools separates the act of scheduling (adding people to roles) from the act of notifying them. A scheduler can make 30 assignments across 3 services without anyone receiving a notification. Only when the scheduler clicks "Send Invites" do the notifications go out. This is significantly better UX than VolunteerCal's current approach (if it sends notifications immediately on assignment). For VolunteerCal: add a `notification_pending` flag on assignments, a batch "Notify scheduled volunteers" action on the schedule detail page, and a preview showing who will be notified.

3. **Multi-service matrix (2–4 services side by side):** VolunteerCal's `schedule-matrix.tsx` should offer a "compare view" mode that shows 2–4 service dates side by side. This is particularly useful for worship teams where the same people serve across consecutive weeks and a scheduler wants to avoid overloading someone.

### 3.3 Availability Management UX

**How WorshipTools does it:**

WorshipTools calls this "Unavailable Dates." Team members go to their own dashboard and add date ranges they're unavailable. No approval required — they self-serve. Admins can also enter unavailable dates on behalf of others. Date ranges are stored and checked automatically during scheduling. No recurring unavailability pattern (e.g., "never available Tuesdays") exists in WorshipTools.

**What VolunteerCal already has that WorshipTools doesn't:**
- `recurring_unavailable: number[]` (days of week) — more powerful
- `blockout_dates: string[]` — equivalent to WorshipTools' Unavailable Dates
- `max_roles_per_month` frequency caps

**Recommendations:**

1. **Volunteer self-service availability page:** VolunteerCal should have a page at `/dashboard/my-availability` (accessible to volunteers, not just admins) where volunteers can manage their own blockout dates and recurring unavailability. Currently this appears to only be admin-controlled. This is table-stakes for any volunteer scheduling tool. The page should mirror WorshipTools' simplicity: a calendar picker to add/remove date blocks.

2. **Visual availability status on scheduler's person-picker:** When an admin opens the assign-volunteer dialog for a role slot, show a small availability indicator next to each volunteer's name. Three states: ✓ Available (green), ✗ Blocked (red/grey with date), ⚡ Near limit (yellow, close to max_roles_per_month). WorshipTools only has the grey/available distinction; VolunteerCal can do better with the richer data model it has.

3. **"Request time off" vs. "block date" distinction:** Consider separating self-service date blocks (set by volunteer, informational) from admin-locked blocks (admin-set, overrides volunteer's own schedule). Right now both use the same `blockout_dates` array. Adding a `locked_blockout_dates: string[]` field that only admins can set gives schedulers the ability to enforce unavailability even if the volunteer tries to remove it.

### 3.4 Service Plan Structure

**How WorshipTools does it:**

Each WorshipTools service has four tabs: Order (the service flow), People (role assignments), Rehearse (practice materials), Charts (chord sheets). The Order tab is a flat list of Headers (organizational dividers, non-executing) and Items (actual content blocks — songs, announcements, prayers, etc.). Items have a Background layer (video/image) and Foreground layer (text/lyrics). Service items can be reordered via drag-and-drop using a 6-dot handle. Notes can be added inline to items by Editors.

**VolunteerCal already has:**
- `service_plans` subcollection with `ServicePlanItem[]`
- `ServicePlanItemType`: song, prayer, announcement, sermon, offering, other
- A plan builder (implied by the `worship/` component folder)

**Recommendations:**

1. **Add a "Header" item type to ServicePlanItem:** WorshipTools' Headers are a lightweight way to visually section a service plan (e.g., "Pre-Service Worship" / "Message" / "Altar Call") without adding fake items. Add `'header'` to `ServicePlanItemType`. Headers render differently (larger, bold, no duration, no song associations). This is a 2-hour change to types + UI.

2. **Inline item notes with role-based editing:** Add a `notes?: string` field to `ServicePlanItem`. In the service plan UI, each item should have an expandable notes section (pencil icon inline). Notes are visible to all viewers but editable only by admins/schedulers. This aligns with WorshipTools' pattern and has high utility (worship leaders use this for key changes, special instructions, arrangements).

3. **Explicit "Publish / Notify Team" action on service plan:** Following the batched notification pattern (see 3.2), the service plan view should have a clear "Notify team" button that triggers confirmation + reminder notifications in one deliberate action, separate from the act of building the plan. This prevents premature or accidental notifications when still drafting.

### 3.5 Recommended Adaptations for VolunteerCal (Priority Order)

Listed in order of estimated impact-to-effort ratio:

**High impact, low effort:**
1. **Inline notes on service plan items** — Add `notes` to ServicePlanItem, render as collapsible in the plan builder. ~2 hours.
2. **"Header" service plan item type** — One new item type, different render style. ~2 hours.
3. **Greyed-out (not hidden) unavailability in person-picker** — Change the assign-volunteer modal to show all eligible volunteers but visually deprioritize blocked ones. ~3 hours.
4. **Volunteer self-service availability page** — `/dashboard/my-availability` — calendar date picker to add/remove blockouts. ~1 day.

**High impact, medium effort:**
5. **Batched "Send Notifications" for schedule assignments** — Add `notification_pending` flag, batch notification action. ~2 days.
6. **Role Group collapse/expand in schedule matrix** — Group role slots by ministry in `schedule-matrix.tsx`, add collapse toggle. ~1 day.

**Medium impact, medium effort:**
7. **Multi-service compare view (2–4 services side by side)** — New view mode for schedule matrix. ~2 days.
8. **Availability status indicator in person-picker** (✓ / ✗ / ⚡) — ~1 day.

**Lower priority (WorshipTools limitation worth not replicating):**
- WorshipTools has no auto-scheduling algorithm — VolunteerCal's existing scheduler is a genuine differentiator. Do not simplify it toward WorshipTools' manual-only model.
- WorshipTools has no recurring unavailability by day-of-week — VolunteerCal already does this better.

---

## Part 4: Implementation Sequencing

### Logical Build Order (no time estimates)

The features in this spec should be built in the following sequence. Each phase unlocks the next.

**Phase 1 — Foundation (Room Data Model + Admin Setup)**

Start here. Nothing else can be built without it.

1. Add `Room`, `Reservation`, `ReservationRequest`, `RoomSettings`, `RecurrenceRule`, `ReservationStatus`, `RecurrenceFrequency`, `RecurrenceEndType`, `ReservationRequestStatus` to `src/lib/types/index.ts`
2. Add tier gating constants to `src/lib/constants/index.ts`
3. Create Firestore composite indexes in `firestore.indexes.json`
4. Build `POST /api/rooms`, `GET /api/rooms`, `PUT /api/rooms/[roomId]` routes
5. Build admin rooms list page (`/dashboard/rooms`) with `RoomCard` component
6. Build room create/edit form

**Phase 2 — Basic Reservation Booking**

7. Build `RecurrenceRulePicker` component
8. Build `RoomBookingForm` (5-step wizard, non-recurring first)
9. Build `POST /api/reservations` with conflict detection logic
10. Build `GET /api/reservations` with filters
11. Build basic reservation list view (per room, per user)
12. Add recurrence support to `RoomBookingForm` + `POST /api/reservations`
13. Build recurrence generation utility (`src/lib/utils/recurrence.ts`)

**Phase 3 — Conflict Approval Flow**

14. Build `ReservationConflictModal`
15. Build `ReservationRequestCard`
16. Build admin requests queue (`/dashboard/rooms/requests`)
17. Build `POST /api/reservation-requests/[requestId]/approve` and `/deny`
18. Wire up SMS notifications via existing `src/lib/services/sms.ts`

**Phase 4 — Room Display (Kiosk)**

19. Create `src/app/display/layout.tsx` (blank layout, no nav)
20. Build `RoomDisplayPage` component with Firestore real-time listener
21. Build `GET /api/display/room/[roomId]` public API route
22. Build `/display/room/[roomId]` page

**Phase 5 — iCal Feeds**

23. Extend `src/lib/utils/ical.ts` to support reservations (or create `src/lib/utils/reservation-ical.ts`)
24. Build room iCal route (`/api/calendar/room/[roomId]/[token].ics`)
25. Build church-wide iCal route
26. Build ministry iCal route
27. Add calendar token UI to room admin detail page

**Phase 6 — Embedded Calendar View**

28. Build `RoomCalendarView` component (month/week/day views)
29. Build `/calendar` authenticated page
30. Build `/calendar/public` public page
31. Add `?embed=true` query param handling and iframe-safe headers

**Phase 7 — WorshipTools UX Improvements**

32. Add `'header'` to `ServicePlanItemType`, update plan builder rendering
33. Add `notes` to `ServicePlanItem`, update plan builder UI
34. Build `/dashboard/my-availability` volunteer self-service page
35. Update assign-volunteer modal to grey out (not hide) unavailable volunteers
36. Add `notification_pending` flag + batch notify action to schedule detail page

**Phase 8 — KidCheck Integration**

37. Add `KidCheckConfig`, `KidCheckSyncLog` types
38. Build `POST /api/integrations/kidcheck/config`
39. Build `GET /api/integrations/kidcheck/export` (CSV download)
40. Build `POST /api/integrations/kidcheck/import` (CSV upload + parse)
41. Add KidCheck card to `/dashboard/settings/integrations`
42. Add "Check In at KidCheck" deep link button to children's ministry assignment cards

### Dependencies Between Features

```
Phase 1 (data models) → required for all other phases
Phase 2 (basic booking) → required before Phase 3, 4, 5, 6
Phase 3 (conflict flow) → can be built in parallel with Phase 4
Phase 4 (kiosk display) → depends on Phase 2
Phase 5 (iCal) → depends on Phase 2; extends existing ical.ts
Phase 6 (calendar view) → depends on Phase 2; can use existing Phase 5 data
Phase 7 (WorshipTools UX) → independent of Phases 1–6; can be built anytime
Phase 8 (KidCheck) → partially independent; import/export depends on existing assignments data
```

### Shared Infrastructure That Unlocks Multiple Features

**`src/lib/utils/recurrence.ts`** — Builds once in Phase 2, reused by:
- iCal generation (Phase 5) — iterate occurrences for RRULE export
- Conflict detection (Phase 3) — check all occurrences of a recurring reservation for conflicts
- Calendar view (Phase 6) — materialize occurrences for rendering

**Firestore real-time pattern in `RoomDisplayPage`** — The `onSnapshot` + full-screen UI pattern can be reused for future live features (stage sync already uses this via `stage_sync_live` collection).

**Extended iCal utility** — Once rooms generate iCal feeds (Phase 5), the same utility can be used to add iCal export to the individual volunteer assignment view (currently it only generates from `/api/calendar`).

**Notification infrastructure** — The SMS + in-app notification pattern for reservation approval (Phase 3) is identical to the existing pattern in `sent_notifications`. No new infrastructure needed — just new `notification_type` values.

---

## Appendix A: Claude Code Kickoff Prompt

Paste the following into Claude Code to begin implementation:

---

```
Read the file at the path below before writing any code. It is the complete implementation specification for three VolunteerCal feature areas:

  /Users/wes/Library/Mobile Documents/com~apple~CloudDocs/WestleyBurton/Claude Dispatch/VolunteerCal Feature Spec — KidCheck + Rooms + WorshipTools.md

After reading the spec:

1. Open the VolunteerCal codebase (HarpElle/volunteercalendar). Read these files first to orient yourself:
   - src/lib/types/index.ts
   - src/lib/constants/index.ts
   - src/lib/utils/ical.ts
   - src/app/api/songs/route.ts (example of existing API route pattern)
   - src/components/ui/ (existing UI component patterns)

2. Begin implementation with **Part 2: Room & Resource Scheduling**, following the exact sequencing in Section 4 of the spec (Part 4, "Logical Build Order").

3. Start at Phase 1 — Foundation:
   - Add all new TypeScript types to src/lib/types/index.ts
   - Add tier gating constants to src/lib/constants/index.ts
   - Add new Firestore composite indexes to firestore.indexes.json
   - Build the rooms API routes (GET + POST /api/rooms)
   - Build the admin rooms list page and RoomCard component

4. After completing Phase 1, proceed through phases in order (Phase 2 → 3 → 4 → 5 → 6).

5. Ask clarifying questions only if something in the spec is genuinely ambiguous. The spec is detailed enough to begin immediately. Do not ask for permission before each phase — proceed continuously.

6. After completing all Room/Resource Scheduling phases, move to Part 3 (WorshipTools UX improvements, Phase 7), then Part 1 (Native Children's Check-In, Phase 8).

**Important — Part 1 is now Native Check-In, not KidCheck:** Part 1 has been fully rewritten as a first-party children's check-in system. It covers: household and child Firestore data models (`households`, `children`, `checkInSessions`), an iPad kiosk flow at `/checkin`, native label printing via a `PrinterAdapter` interface with Tier 1 support for Brother QL series (WiFi TCP/9100 + `brother_ql` Python library + `canvas` npm) and Zebra ZD series (ZPL over TCP/9100 via Node.js `net` module), Tier 2 support for Dymo LabelWriter (Dymo Connect JS SDK, client-side), a teacher room view at `/checkin/room/[roomId]`, secure pickup verification, Breeze CSV migration import, and attendance reporting. Phase 8 in Part 4's build order corresponds to this native check-in feature.

**Key check-in files to create:**
- `src/lib/services/printing/PrinterAdapter.ts` — adapter interface
- `src/lib/services/printing/BrotherQLAdapter.ts` — Brother QL implementation (Python bridge)
- `src/lib/services/printing/ZebraZDAdapter.ts` — Zebra ZPL TCP implementation
- `src/lib/services/printing/DymoAdapter.ts` — Dymo client-side implementation
- `src/lib/services/printing/PrinterAdapterFactory.ts` — factory
- `src/lib/utils/securityCode.ts` — security code generator
- `src/app/checkin/layout.tsx` — blank kiosk layout (no nav)
- `src/app/checkin/page.tsx` — kiosk family lookup + check-in flow
- `src/app/checkin/room/[roomId]/page.tsx` — teacher room view

**Server prerequisite:** Python 3 and `pip install brother-ql` must be available on the deployment server for Brother QL printing. Document in deployment guide.

Note on architecture: This is a Next.js 16 App Router project with Firebase/Firestore backend, Tailwind CSS v4, and shadcn/ui components. All Firestore writes go through API routes (not direct client writes), authenticated via Firebase Bearer tokens verified with the Admin SDK. Follow all patterns exactly as they exist in the codebase.
```

---

## Appendix B: Firestore Security Rules Additions

Add these rules to `firestore.rules` alongside existing rules:

```
// Room display: allow public reads for display-enabled rooms
match /churches/{churchId}/rooms/{roomId} {
  allow read: if resource.data.display_public == true
              || isSignedIn();
  allow write: if hasOrgRole(churchId, ['owner', 'admin']);
}

// Reservations: public read for display-enabled rooms only
match /churches/{churchId}/reservations/{reservationId} {
  allow read: if isSignedIn()
              || (resource.data.status == 'confirmed'
                  && isRoomDisplayPublic(churchId, resource.data.room_id));
  allow create: if isSignedIn();
  allow update, delete: if isSignedIn()
                        && (isOwnReservation(churchId)
                            || hasOrgRole(churchId, ['owner', 'admin']));
}

// Reservation requests: admin only
match /churches/{churchId}/reservation_requests/{requestId} {
  allow read, write: if hasOrgRole(churchId, ['owner', 'admin']);
}

// Room settings: authenticated reads, admin writes
match /churches/{churchId}/room_settings/{doc} {
  allow read: if isSignedIn();
  allow write: if hasOrgRole(churchId, ['owner', 'admin']);
}

// KidCheck config: admin only
match /churches/{churchId}/integrations/kidcheck {
  allow read, write: if hasOrgRole(churchId, ['owner', 'admin']);
}

// KidCheck sync logs: admin only
match /churches/{churchId}/kidcheck_sync_logs/{logId} {
  allow read: if hasOrgRole(churchId, ['owner', 'admin']);
  allow write: if false; // write-only via Admin SDK in API routes
}
```

Note: `isRoomDisplayPublic` is a helper function that needs to be added to Firestore rules — it requires a `get()` call to check the room document. This incurs a read cost; consider caching the display_public flag on each reservation document as a denormalized field to avoid this.

---

*End of specification. Document version 1.0, March 22, 2026.*
