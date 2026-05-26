# Firestore Backup & Restore Runbook

Daily managed exports of Firestore to a Cloud Storage bucket, retained 30 days.
Wave 1 item 3 of the launch-readiness plan. Last reviewed 2026-05-26.

---

## What this gives us

- **Daily snapshot** of every Firestore collection in `volunteercalendar-mvp`
  (including subcollections like `churches/{id}/people`, `event_signups`,
  `memberships`, `platform_orgs`, etc.).
- **30-day rolling retention** via Cloud Storage lifecycle policy.
- **Point-in-time-ish restore** to a separate "restore" project for triage,
  or in-place restore for a true disaster recovery (rare).

**This is _not_ a substitute for**:
- Audit logs (already covered by `audit_logs` collection + the activity page).
- Real-time PITR (would need to upgrade to Firestore PITR, currently $0.18/GB-month
  on top of existing storage — defer to post-launch).

## One-time setup

You run all of this from `gcloud` (or the GCP Cloud Shell — even easier, no
auth needed). Project ID is `volunteercalendar-mvp`. Pick a region — these
commands use `us-central1` to match where Firestore lives.

### 1. Create the backup bucket

```bash
PROJECT_ID="volunteercalendar-mvp"
BUCKET="${PROJECT_ID}-firestore-backups"
REGION="us-central1"

gcloud config set project "${PROJECT_ID}"

gcloud storage buckets create "gs://${BUCKET}" \
  --location="${REGION}" \
  --uniform-bucket-level-access \
  --default-storage-class=NEARLINE
```

`NEARLINE` storage is ~half the cost of `STANDARD` for objects accessed less than
once a month — exactly the backup access pattern. Egress on restore is still free
since we restore to the same project.

### 2. Apply a 30-day lifecycle rule

Save this as `lifecycle.json`:

```json
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": { "age": 30 }
      }
    ]
  }
}
```

Apply it:

```bash
gcloud storage buckets update "gs://${BUCKET}" --lifecycle-file=lifecycle.json
```

Verify:

```bash
gcloud storage buckets describe "gs://${BUCKET}" --format="value(lifecycle)"
```

### 3. Grant the Firestore service agent permission to write to the bucket

Firestore exports run as the project's Firestore service agent. Grant it
`roles/storage.admin` scoped to just the backup bucket:

```bash
SERVICE_AGENT="service-$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')@gcp-sa-firestore.iam.gserviceaccount.com"

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SERVICE_AGENT}" \
  --role="roles/storage.admin"
```

### 4. Schedule the nightly export with Cloud Scheduler

Cloud Scheduler is the simplest "cron in GCP". We schedule it to fire an HTTP
POST against the Firestore Admin REST API every night at 03:00 UTC (10pm
Central / 8pm Pacific — well outside any reasonable user activity window).

```bash
# Enable the APIs we need (idempotent if already enabled)
gcloud services enable \
  cloudscheduler.googleapis.com \
  firestore.googleapis.com \
  appengine.googleapis.com

# Cloud Scheduler requires an App Engine app exist in the project (legacy
# requirement). Creating an app costs nothing if you don't deploy code to it.
# Skip this if `gcloud app describe` returns successfully.
gcloud app create --region=us-central || echo "App already exists"

# Create the schedule
gcloud scheduler jobs create http firestore-daily-backup \
  --location="${REGION}" \
  --schedule="0 3 * * *" \
  --time-zone="UTC" \
  --uri="https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default):exportDocuments" \
  --http-method=POST \
  --oauth-service-account-email="${PROJECT_ID}@appspot.gserviceaccount.com" \
  --oauth-token-scope="https://www.googleapis.com/auth/datastore" \
  --message-body="{\"outputUriPrefix\":\"gs://${BUCKET}/$(date +%Y%m%d-%H%M%S)\"}"
```

> ⚠️ **The `--message-body` interpolates `$(date)` at *job-creation* time, not
> at run time.** Every run will overwrite the same path. To get per-run
> timestamped directories you need a tiny Cloud Function or a shell wrapper —
> see the Production-grade upgrade section below. The simple version above is
> still fine for getting *something* running today; daily overwrite means we
> only ever keep the latest export in that path. Combined with the 30-day
> lifecycle rule, that's not what we want long term.

### 4-alt. Per-run timestamped exports (the right shape)

The cleanest production-grade approach is a Cloud Function that the scheduler
invokes, which computes the timestamp and calls the export API. Cost is
basically zero (one invocation/day).

```bash
# Create the function (TypeScript/Node 20)
mkdir -p ~/firestore-backup-fn && cd ~/firestore-backup-fn
cat > package.json <<'EOF'
{
  "name": "firestore-backup-fn",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "googleapis": "^144.0.0"
  }
}
EOF

cat > index.js <<'EOF'
const { google } = require("googleapis");

exports.firestoreBackup = async (req, res) => {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  const client = await auth.getClient();
  const projectId = process.env.GCP_PROJECT_ID;
  const bucket = process.env.BACKUP_BUCKET;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outputUriPrefix = `gs://${bucket}/${ts}`;

  const resp = await client.request({
    url: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default):exportDocuments`,
    method: "POST",
    data: { outputUriPrefix },
  });
  console.log(`Export started: ${outputUriPrefix}`, resp.data.name);
  res.status(200).send(`OK: ${outputUriPrefix}`);
};
EOF

# Deploy as a 2nd-gen HTTP function
gcloud functions deploy firestore-backup-fn \
  --gen2 \
  --runtime=nodejs20 \
  --region="${REGION}" \
  --source=. \
  --entry-point=firestoreBackup \
  --trigger-http \
  --no-allow-unauthenticated \
  --set-env-vars="GCP_PROJECT_ID=${PROJECT_ID},BACKUP_BUCKET=${BUCKET}" \
  --service-account="${PROJECT_ID}@appspot.gserviceaccount.com"

# Get the function URL
FN_URL=$(gcloud functions describe firestore-backup-fn --region="${REGION}" --gen2 --format='value(serviceConfig.uri)')

# Recreate the scheduler job to invoke the function (delete the old one first)
gcloud scheduler jobs delete firestore-daily-backup --location="${REGION}" --quiet || true

gcloud scheduler jobs create http firestore-daily-backup \
  --location="${REGION}" \
  --schedule="0 3 * * *" \
  --time-zone="UTC" \
  --uri="${FN_URL}" \
  --http-method=POST \
  --oidc-service-account-email="${PROJECT_ID}@appspot.gserviceaccount.com" \
  --oidc-token-audience="${FN_URL}"
```

The function needs `roles/datastore.importExportAdmin` on the project. Grant
once:

```bash
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com" \
  --role="roles/datastore.importExportAdmin"
```

### 5. Test it once manually

Force-run the scheduler job and confirm an export lands in the bucket:

```bash
gcloud scheduler jobs run firestore-daily-backup --location="${REGION}"

# Wait ~5–15 min for a small DB; then list:
gcloud storage ls "gs://${BUCKET}/" --recursive | head
```

You should see a top-level timestamped directory containing one or more
`*.overall_export_metadata` files, plus per-collection subdirectories.

---

## Verifying ongoing backups

Once a week (Monday morning is fine), eyeball:

```bash
gcloud storage ls "gs://${BUCKET}/" | tail -10
```

You should see at most ~30 timestamped dirs (lifecycle rule prunes the rest).
The most recent one should be from the previous night.

Optional: a tiny check in the platform admin dashboard that 404s the bucket if
it's older than 36 hours. **Deferred** — not worth the GCP perms plumbing yet.

---

## Restore — disaster recovery

> ⚠️ **A full in-place restore overwrites the entire production database.**
> Don't do this lightly. For everything short of "the whole DB is corrupted",
> use the targeted-restore-to-a-temp-project pattern below instead.

### Targeted restore (single collection, to a temp project)

1. **Create a throwaway project** (or reuse a staging one).
   ```bash
   gcloud projects create vc-restore-test --name="VC Restore Test"
   gcloud config set project vc-restore-test
   gcloud firestore databases create --location="${REGION}"
   ```

2. **Grant cross-project read on the backup bucket** to the restore project's
   Firestore service agent (one-time):
   ```bash
   RESTORE_AGENT="service-$(gcloud projects describe vc-restore-test --format='value(projectNumber)')@gcp-sa-firestore.iam.gserviceaccount.com"
   gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
     --member="serviceAccount:${RESTORE_AGENT}" \
     --role="roles/storage.objectViewer"
   ```

3. **Import the snapshot you want.** Replace `<TIMESTAMP>` with the dir name
   from `gcloud storage ls`. Collection filter is optional — drop it to restore
   everything.
   ```bash
   gcloud firestore import "gs://${BUCKET}/<TIMESTAMP>" \
     --project=vc-restore-test \
     --collection-ids="people,memberships"
   ```

4. **Inspect** in the Firebase Console for that project. Pull out the docs you
   need, write a one-off script to copy them back to production, or just hand-
   patch the few affected records.

### Full in-place restore (worst-case)

Only do this if production is genuinely corrupted and rollback is the
explicitly correct call.

1. **Put the app in maintenance mode** — flip a Vercel env var or push a
   maintenance-mode middleware that 503s all traffic. Stripe webhooks should
   still succeed (Stripe retries, but you don't want to lose payments during
   downtime); consider pausing the Stripe webhook endpoint URL temporarily so
   Stripe queues retries instead.
2. **Identify the snapshot.** Almost always "yesterday's nightly" is the right
   answer. List with `gcloud storage ls "gs://${BUCKET}/"`.
3. **Run the import** against production:
   ```bash
   gcloud firestore import "gs://${BUCKET}/<TIMESTAMP>" --project="${PROJECT_ID}"
   ```
   Takes minutes for our scale; can take hours at TB scale.
4. **Smoke-test** a handful of representative orgs end-to-end (login, view
   schedule, check-in flow) before exiting maintenance mode.

**Data loss window**: everything written after the snapshot timestamp is gone.
If the corruption window is small, prefer the targeted restore pattern above
and surgically patch what's needed instead of a full rollback.

---

## Cost estimate

At our current scale (estimate: <5 GB Firestore, <50 collections):

- **Storage**: ~5 GB × 30 days × $0.010/GB-mo (NEARLINE) ≈ **$1.50/mo**
- **Operations**: ~30 exports/mo × negligible API charges ≈ **$0**
- **Cloud Scheduler**: free tier covers 3 jobs at this frequency
- **Cloud Function**: ~30 invocations/mo, sub-second runtime ≈ **$0**

Total: ~**$2/mo**. Grows linearly with Firestore size; at 50 GB we'd be ~$15/mo.
Acceptable through any reasonable scale we'll see this year.

---

## Things to revisit post-launch

- **PITR (Point-in-Time Recovery)** — Firestore has a managed feature that
  retains 7 days of history with per-second resolution. ~$0.18/GB-mo on top of
  storage. Better RPO than nightly snapshots. Defer until we have paying
  customers whose data warrants tighter guarantees.
- **Restore drill** — once a quarter, do a targeted restore of one collection
  to the test project. Confirms backups work and that we remember how. Add a
  reminder in your calendar.
- **Multi-region** — currently we're single-region (us-central1). Cross-region
  replication is a separate setup; not worth it pre-launch.
