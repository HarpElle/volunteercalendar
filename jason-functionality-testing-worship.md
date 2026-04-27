# Functionality Testing — Worship & Service Planning

Song library, service plans, ProPresenter export, Stage Sync. Available on Growth tier and above.

## Prerequisites

- Org on Growth tier or higher (use platform-admin override for testing)
- A worship team (ministry) with a few volunteers
- Service times configured

---

## Test 1 — Add songs to library

**Steps**
1. `Worship → Songs → Add Song`
2. Enter: title, key (e.g. G), tempo (BPM), CCLI number (optional)
3. Add a chord chart (manual entry, PDF upload, or SongSelect import if configured)
4. Save → repeat for 5–10 songs

**Expected**
- Songs appear in library
- Each has metadata + chart accessible

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/songs` | Docs with title, key, tempo, ccli_number |

☐ **Pass / Fail**: ___

---

## Test 2 — PDF chord chart upload (Anthropic Vision parsing)

**Steps**
1. Upload a PDF chord chart for an existing song
2. The system uses Claude Vision to extract metadata

**Expected**
- After upload, fields auto-populate: title, key, tempo, CCLI number
- Original PDF stored for native display
- You can edit the auto-extracted fields

**Verify**
| Where | What |
|---|---|
| Song doc | `chart_data.text` populated, `chart_data.imported_from: "pdf_upload"` |
| Storage `churches/{churchId}/song_files/...` | PDF file present |

**Failure modes**:
- PDF parsing fails → user sees a clear error, not a silent failure
- Claude API quota exceeded → handled gracefully

☐ **Pass / Fail**: ___

---

## Test 3 — SongSelect integration (if CCLI configured)

**Steps** (Phase 2 if not configured)
1. Settings → Integrations → CCLI SongSelect → enter credentials
2. Songs → Import from SongSelect → search by title or CCLI number
3. Pick one → import

**Expected**
- Lyrics + chord chart imported automatically
- CCLI metadata populated correctly

☐ **Pass / Fail**: ___ (skip if CCLI not configured)

---

## Test 4 — Create a service plan

**Steps**
1. `Worship → Service Plans → New Plan`
2. Pick a service date (next Sunday)
3. Add 5 songs in order: opening, hymn, intro song, sermon song, closing
4. Add header items: "Welcome", "Announcements", "Sermon"
5. Add inline notes between songs (e.g., "Pause for prayer")
6. Save as draft

**Expected**
- Plan appears with songs in order, headers + notes interleaved
- Each song shows key, tempo, vocalist if assigned

**Verify**
| Where | What |
|---|---|
| `churches/{churchId}/service_plans/{id}` | Plan doc with item array |
| `churches/{churchId}/service_plans/{id}/arrangements` | Per-song arrangement subcollection |

☐ **Pass / Fail**: ___

---

## Test 5 — Assign worship team to the plan

**Steps**
1. From the plan → Assignments tab
2. Assign volunteers to roles (lead vocals, BGV, drums, etc.)
3. Save

**Expected**
- Assignments link to the underlying schedule
- Volunteers can see they're booked from their dashboard

☐ **Pass / Fail**: ___

---

## Test 6 — Publish service plan

**Steps**
1. From draft plan → Publish

**Expected**
- Plan becomes visible to the assigned worship team
- They get notification emails (similar to schedule publish — uses outbox)

**Verify**
| Where | What |
|---|---|
| Plan doc | `status: "published"`, `published_at` timestamp |
| Outbox | New pending email entries |

☐ **Pass / Fail**: ___

---

## Test 7 — ProPresenter export

**Steps**
1. From a published plan → "Export for ProPresenter" → download
2. Open in ProPresenter

**Expected**
- File contains slides for each song
- Lyrics + chord chart included
- Format: `.pro` or `.zip` containing per-song files

**Triggered automatically** by daily cron (`/api/cron/propresenter-export`):
- Sends export to tech/media leads 24h before each published plan
- Test by manually invoking:
```bash
curl -X GET "https://volunteercal.com/api/cron/propresenter-export" \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Verify**
| Where | What |
|---|---|
| Email recipients (configured tech leads) | Received the export attachment |
| Cron logs | Successful processing of plans 24h out |

☐ **Pass / Fail**: ___

---

## Test 8 — Song usage tracking + CSV export (CCLI)

**Steps**
1. Worship → Reports → Song Usage Report
2. Select date range (last 6 months)
3. Export CSV

**Expected**
- CSV includes: song title, CCLI number, date used, copyright, attribution
- Format matches CCLI's reporting requirements

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/song_usage` | One doc per song-on-service-date |
| CSV file | Columns and rows match expectations |

☐ **Pass / Fail**: ___

---

## Test 9 — Stage Sync — broadcaster (conductor)

**Steps**
1. Worship → Stage Sync → Conductor view → pick today's plan
2. Tap "Start"
3. Step through the plan items one by one

**Expected**
- Each tap advances the current item
- A token is generated → other devices can subscribe via the viewer URL

☐ **Pass / Fail**: ___

---

## Test 10 — Stage Sync — viewer

**Steps**
1. From the conductor → copy "Viewer URL"
2. Open on a separate device (phone, laptop, projector laptop)
3. Wait for conductor to advance items

**Expected**
- Viewer reflects the current item in real-time (within 1-2 seconds)
- Lyrics or chord chart shown depending on item type
- Auto-scroll if multiple lines

**Verify**
| Where | What |
|---|---|
| `stage_sync_live/{token}` Firestore doc | Updates with each conductor tap |

☐ **Pass / Fail**: ___

**Important security note**: the doc ID IS the auth (capability URL pattern, see Track A.3). NEVER share the viewer URL publicly — anyone with it sees what's on stage. The data should contain only public-display content (lyrics, current item title) — not member lists, PII, etc.

---

## Test 11 — Multi-stage approval workflow

**Steps** (Pro tier feature)
1. Settings → enable multi-stage approval for service plans
2. Create a plan → submit for approval (don't publish directly)
3. As an approver → review and approve

**Expected**
- Plan goes through approval gate before publish
- Approvers receive notification
- Audit trail shows who approved when

☐ **Pass / Fail**: ___

---

## Failure modes to watch

- **PDF parse fails silently** — user uploads a PDF, no metadata extracted, no error message. Should always either succeed or show a clear error.
- **Stage Sync delay > 5 seconds** — Firestore real-time should be sub-second; a 5+ sec delay points to a network issue or the page not subscribed correctly.
- **Wrong song shown to viewer** — token mismatch; tell me immediately.
- **CSV export missing CCLI numbers** — defeats the entire point of the export. Spot-check.
- **ProPresenter export crashes when opened** — file format regression. Test with the actual ProPresenter version your team uses.

## What I can't test for you

- Real ProPresenter import on your Mac
- Stage Sync over a real church Wi-Fi (latency, packet loss)
- CCLI's actual acceptance of your CSV
- The lighting / projector setup that displays the lyrics
