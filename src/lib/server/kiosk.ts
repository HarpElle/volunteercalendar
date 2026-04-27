/**
 * Kiosk station + activation + token primitives (Track B).
 *
 * All persistence here uses the Admin SDK. Firestore rules deny client
 * access to `kiosk_stations`, `kiosk_activations`, and `kiosk_tokens`.
 */

import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "node:crypto";
import type {
  KioskActivation,
  KioskScope,
  KioskStation,
  KioskToken,
} from "@/lib/types";

const ACTIVATION_TTL_MS = 10 * 60 * 1000;

const DEFAULT_SCOPES: KioskScope[] = [
  "lookup",
  "checkin",
  "checkout",
  "register",
  "print",
  "services",
  "room",
];

// ─── ID + token generation ──────────────────────────────────────────────────

/** 8-character uppercase hex code; ~10^9.6 keyspace. Good for short TTL. */
export function generateActivationCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

/** Doc ID for a station — random-ish, URL-safe, doesn't reveal church. */
export function generateStationId(): string {
  return `stn_${crypto.randomBytes(8).toString("hex")}`;
}

/** Doc ID for a token + a high-entropy secret half. */
export function generateTokenIdAndSecret(): { tokenId: string; secret: string } {
  return {
    tokenId: `kt_${crypto.randomBytes(6).toString("hex")}`,
    secret: crypto.randomBytes(32).toString("base64url"),
  };
}

export function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

// ─── Station CRUD ───────────────────────────────────────────────────────────

export async function createStation(opts: {
  church_id: string;
  name: string;
  created_by_uid: string;
}): Promise<{ station: KioskStation; activation: KioskActivation; code: string }> {
  const stationId = generateStationId();
  const code = generateActivationCode();
  const now = new Date().toISOString();

  const station: KioskStation = {
    id: stationId,
    church_id: opts.church_id,
    name: opts.name.trim(),
    status: "active",
    created_at: now,
    created_by_uid: opts.created_by_uid,
    revoked_at: null,
    revoked_by_uid: null,
    last_used_at: null,
    active_token_id: null,
  };

  const activation: KioskActivation = {
    code,
    station_id: stationId,
    church_id: opts.church_id,
    expires_at: new Date(Date.now() + ACTIVATION_TTL_MS).toISOString(),
    consumed_at: null,
    consumed_by_device: null,
    created_at: now,
    created_by_uid: opts.created_by_uid,
  };

  const batch = adminDb.batch();
  batch.set(adminDb.doc(`kiosk_stations/${stationId}`), station);
  batch.set(adminDb.doc(`kiosk_activations/${code}`), activation);
  await batch.commit();

  return { station, activation, code };
}

export async function reissueActivationCode(opts: {
  station_id: string;
  church_id: string;
  created_by_uid: string;
}): Promise<{ activation: KioskActivation; code: string }> {
  const code = generateActivationCode();
  const now = new Date().toISOString();
  const activation: KioskActivation = {
    code,
    station_id: opts.station_id,
    church_id: opts.church_id,
    expires_at: new Date(Date.now() + ACTIVATION_TTL_MS).toISOString(),
    consumed_at: null,
    consumed_by_device: null,
    created_at: now,
    created_by_uid: opts.created_by_uid,
  };
  await adminDb.doc(`kiosk_activations/${code}`).set(activation);
  return { activation, code };
}

export async function listStationsForChurch(
  church_id: string,
): Promise<KioskStation[]> {
  const snap = await adminDb
    .collection("kiosk_stations")
    .where("church_id", "==", church_id)
    .orderBy("created_at", "desc")
    .get();
  return snap.docs.map((d) => d.data() as KioskStation);
}

export async function revokeStation(opts: {
  station_id: string;
  church_id: string;
  revoked_by_uid: string;
}): Promise<KioskStation | null> {
  const stationRef = adminDb.doc(`kiosk_stations/${opts.station_id}`);
  return adminDb.runTransaction(async (tx) => {
    const stationSnap = await tx.get(stationRef);
    if (!stationSnap.exists) return null;
    const station = stationSnap.data() as KioskStation;
    if (station.church_id !== opts.church_id) return null;
    if (station.status === "revoked") return station;

    const now = new Date().toISOString();
    tx.update(stationRef, {
      status: "revoked",
      revoked_at: now,
      revoked_by_uid: opts.revoked_by_uid,
      active_token_id: null,
    });
    // Revoke any active token for this station.
    if (station.active_token_id) {
      tx.update(adminDb.doc(`kiosk_tokens/${station.active_token_id}`), {
        revoked_at: now,
      });
    }
    return {
      ...station,
      status: "revoked",
      revoked_at: now,
      revoked_by_uid: opts.revoked_by_uid,
      active_token_id: null,
    };
  });
}

// ─── Activation flow ────────────────────────────────────────────────────────

export class ActivationError extends Error {
  constructor(
    public code: "not_found" | "expired" | "consumed" | "station_revoked",
  ) {
    super(code);
  }
}

/**
 * Consume a one-time activation code and issue a long-lived station token.
 * Returns the public token form `${tokenId}.${secret}` exactly once; only
 * the SHA-256 hash of the secret is persisted.
 */
export async function consumeActivation(opts: {
  code: string;
  device_fingerprint?: string | null;
}): Promise<{ token: string; station: KioskStation }> {
  const { tokenId, secret } = generateTokenIdAndSecret();
  const tokenHash = hashSecret(secret);
  const code = opts.code.toUpperCase();

  const codeRef = adminDb.doc(`kiosk_activations/${code}`);

  // We can't do everything in one transaction because we need to read the
  // station too. Run a transaction over the activation + station + new token.
  const result = await adminDb.runTransaction(async (tx) => {
    const codeSnap = await tx.get(codeRef);
    if (!codeSnap.exists) throw new ActivationError("not_found");

    const activation = codeSnap.data() as KioskActivation;
    if (activation.consumed_at) throw new ActivationError("consumed");
    if (new Date(activation.expires_at).getTime() < Date.now()) {
      throw new ActivationError("expired");
    }

    const stationRef = adminDb.doc(`kiosk_stations/${activation.station_id}`);
    const stationSnap = await tx.get(stationRef);
    if (!stationSnap.exists) throw new ActivationError("not_found");
    const station = stationSnap.data() as KioskStation;
    if (station.status === "revoked") {
      throw new ActivationError("station_revoked");
    }

    const now = new Date().toISOString();
    const newToken: KioskToken = {
      id: tokenId,
      token_hash: tokenHash,
      station_id: station.id,
      church_id: station.church_id,
      scope: DEFAULT_SCOPES,
      created_at: now,
      last_used_at: null,
      revoked_at: null,
      expires_at: null, // long-lived; revoke from admin UI to invalidate
      device_fingerprint: opts.device_fingerprint ?? null,
    };

    // If the station already had an active token, revoke it so only one
    // device can authenticate at a time per station.
    if (station.active_token_id) {
      tx.update(adminDb.doc(`kiosk_tokens/${station.active_token_id}`), {
        revoked_at: now,
      });
    }

    tx.set(adminDb.doc(`kiosk_tokens/${tokenId}`), newToken);
    tx.update(stationRef, {
      active_token_id: tokenId,
      last_used_at: now,
    });
    tx.update(codeRef, {
      consumed_at: now,
      consumed_by_device: opts.device_fingerprint ?? null,
    });

    return station;
  });

  return { token: `${tokenId}.${secret}`, station: result };
}

// ─── Token verification (used by requireKioskToken) ─────────────────────────

export interface VerifiedKioskToken {
  station: KioskStation;
  tokenId: string;
}

export async function verifyKioskToken(
  presented: string,
): Promise<VerifiedKioskToken | null> {
  const dot = presented.indexOf(".");
  if (dot <= 0 || dot === presented.length - 1) return null;
  const tokenId = presented.slice(0, dot);
  const secret = presented.slice(dot + 1);
  if (!tokenId.startsWith("kt_")) return null;

  const tokenSnap = await adminDb.doc(`kiosk_tokens/${tokenId}`).get();
  if (!tokenSnap.exists) return null;
  const tok = tokenSnap.data() as KioskToken;

  if (tok.revoked_at) return null;
  if (tok.expires_at && new Date(tok.expires_at).getTime() < Date.now()) {
    return null;
  }

  const presentedHash = hashSecret(secret);
  const a = Buffer.from(presentedHash, "hex");
  const b = Buffer.from(tok.token_hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const stationSnap = await adminDb
    .doc(`kiosk_stations/${tok.station_id}`)
    .get();
  if (!stationSnap.exists) return null;
  const station = stationSnap.data() as KioskStation;
  if (station.status === "revoked") return null;

  // Best-effort last_used update; don't block the request on it.
  void adminDb
    .doc(`kiosk_tokens/${tokenId}`)
    .update({ last_used_at: FieldValue.serverTimestamp() })
    .catch(() => {});
  void adminDb
    .doc(`kiosk_stations/${station.id}`)
    .update({ last_used_at: FieldValue.serverTimestamp() })
    .catch(() => {});

  return { station, tokenId };
}
