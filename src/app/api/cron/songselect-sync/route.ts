import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { songselectAdapter } from "@/lib/integrations/songselect";

/**
 * GET /api/cron/songselect-sync
 * Weekly cron job that re-syncs metadata for songs imported from SongSelect.
 * Only runs for churches with auto_sync_enabled = true.
 *
 * Secured by Vercel CRON_SECRET header.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: {
    church_id: string;
    synced: number;
    errors: number;
  }[] = [];

  try {
    // Find all churches with SongSelect auto-sync enabled
    const churchesSnap = await adminDb
      .collection("churches")
      .where("songselect_credentials.auto_sync_enabled", "==", true)
      .get();

    for (const churchDoc of churchesSnap.docs) {
      const churchId = churchDoc.id;
      const creds = churchDoc.data().songselect_credentials;

      if (!creds?.email || !creds?.encrypted_password) continue;

      const password = Buffer.from(creds.encrypted_password, "base64").toString("utf-8");

      // Get songs with songselect_id
      const songsSnap = await adminDb
        .collection("churches")
        .doc(churchId)
        .collection("songs")
        .where("songselect_id", "!=", null)
        .where("status", "==", "active")
        .get();

      let synced = 0;
      let errors = 0;

      for (const songDoc of songsSnap.docs) {
        const song = songDoc.data();
        const ssId = song.songselect_id as string;

        try {
          const detail = await songselectAdapter.getSongDetail(
            creds.email,
            password,
            ssId,
          );

          // Update metadata fields that may have changed upstream
          const updates: Record<string, unknown> = {};

          if (detail.ccli_number && detail.ccli_number !== song.ccli_number) {
            updates.ccli_number = detail.ccli_number;
          }
          if (detail.copyright && detail.copyright !== song.copyright) {
            updates.copyright = detail.copyright;
          }
          if (detail.ccli_publisher && detail.ccli_publisher !== song.ccli_publisher) {
            updates.ccli_publisher = detail.ccli_publisher;
          }
          if (detail.writer_credit && detail.writer_credit !== song.writer_credit) {
            updates.writer_credit = detail.writer_credit;
          }
          if (
            detail.available_keys.length > 0 &&
            JSON.stringify(detail.available_keys) !== JSON.stringify(song.available_keys)
          ) {
            updates.available_keys = detail.available_keys;
          }
          // Only update lyrics if the church hasn't manually edited them
          if (
            detail.lyrics &&
            song.lyric_source === "songselect" &&
            detail.lyrics !== song.lyrics
          ) {
            updates.lyrics = detail.lyrics;
          }

          if (Object.keys(updates).length > 0) {
            updates.updated_by = "cron:songselect-sync";
            await songDoc.ref.update(updates);
          }

          synced++;
        } catch {
          errors++;
        }
      }

      // Update last_sync_at
      await adminDb.doc(`churches/${churchId}`).update({
        "songselect_credentials.last_sync_at": new Date().toISOString(),
      });

      results.push({ church_id: churchId, synced, errors });
    }

    return NextResponse.json({
      churches_processed: results.length,
      results,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON songselect-sync]", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
