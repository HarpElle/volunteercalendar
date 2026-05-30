/**
 * Kiosk station + activation + token primitives (Track B).
 *
 * All persistence here uses the Admin SDK. Firestore rules deny client
 * access to `kiosk_stations`, `kiosk_activations`, and `kiosk_tokens`.
 */

import { adminDb } from "@/lib/firebase/admin";
import { log } from "@/lib/log";
import { FieldValue } from "firebase-admin/firestore";
import crypto from "node:crypto";
import type {
  KioskActivation,
  KioskScope,
  KioskStation,
  KioskStationType,
  KioskToken,
} from "@/lib/types";

const ACTIVATION_TTL_MS = 10 * 60 * 1000;

// ─── Station-type → token-scope mapping ─────────────────────────────────────
// Self-service kiosks excludes "checkout" by design — release always happens
// at a staffed station per the industry pattern (PCO docs: "checkout is not
// available on self stations"). See plan P0-1.

const SELF_SERVICE_SCOPES: KioskScope[] = [
  "lookup",
  "checkin",
  "register",
  "print",
  "services",
  "room",
];

const STAFFED_SCOPES: KioskScope[] = [
  "lookup",
  "checkin",
  "checkout",
  "register",
  "print",
  "services",
  "room",
];

/** Derive the allowed token scopes for a given station type. */
export function scopesForStationType(type: KioskStationType): KioskScope[] {
  return type === "staffed" ? STAFFED_SCOPES : SELF_SERVICE_SCOPES;
}

/**
 * Read a station's type from the doc, defaulting to "staffed" for legacy
 * stations that pre-date this field. Staffed = full scope = preserves the
 * pre-P0-1 behavior for any existing kiosks.
 */
function stationTypeOrLegacyDefault(station: KioskStation): KioskStationType {
  return station.type ?? "staffed";
}

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
  type: KioskStationType;
  created_by_uid: string;
}): Promise<{ station: KioskStation; activation: KioskActivation; code: string }> {
  const stationId = generateStationId();
  const code = generateActivationCode();
  const now = new Date().toISOString();

  const station: KioskStation = {
    id: stationId,
    church_id: opts.church_id,
    name: opts.name.trim(),
    type: opts.type,
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
  // Codex Run 2 Phase 3 (2026-05-17): the composite index
  // (church_id, created_at desc) is required for this ordered query.
  // If the index is missing or still building, Firestore throws — fall
  // back to an unordered query so the Stations tab UI shows an empty
  // state (or any existing rows) instead of crashing. Same defensive
  // shape used for /s/[slug] in Round 1.
  try {
    const snap = await adminDb
      .collection("kiosk_stations")
      .where("church_id", "==", church_id)
      .orderBy("created_at", "desc")
      .get();
    return snap.docs.map((d) => d.data() as KioskStation);
  } catch (err) {
    log.warn("listStationsForChurch ordered query failed, retrying unordered", { error: err, church_id });
    const snap = await adminDb
      .collection("kiosk_stations")
      .where("church_id", "==", church_id)
      .get();
    const rows = snap.docs.map((d) => d.data() as KioskStation);
    rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return rows;
  }
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
}): Promise<{
  token: string;
  station: KioskStation;
  /** Derived from station.type at activation time. Surfaced to the kiosk
   *  client so its UI can hide affordances for scopes it doesn't have. */
  allowed_scopes: KioskScope[];
}> {
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
    // P0-1: derive token scope from station type. Self-service kiosks get a
    // narrower scope set without "checkout"; staffed get the full set.
    // Legacy stations (no type field) default to "staffed" → no regression.
    const stationType = stationTypeOrLegacyDefault(station);
    const newToken: KioskToken = {
      id: tokenId,
      token_hash: tokenHash,
      station_id: station.id,
      church_id: station.church_id,
      scope: scopesForStationType(stationType),
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

    return { station, allowed_scopes: newToken.scope };
  });

  return {
    token: `${tokenId}.${secret}`,
    station: result.station,
    allowed_scopes: result.allowed_scopes,
  };
}

// ─── Type change (P0-1) ─────────────────────────────────────────────────────

/**
 * Change a station's type. Atomically:
 *   1. Updates the station's `type` field.
 *   2. Revokes the currently active token (if any) — the existing token's
 *      scope is now wrong relative to the new type.
 *   3. Issues a fresh activation code so the admin can re-enroll the device.
 *
 * Returns the updated station + new activation code. The kiosk operator will
 * be prompted to re-activate on the next request (kioskFetch handles the 401
 * by redirecting to /kiosk).
 */
export async function changeStationType(opts: {
  station_id: string;
  church_id: string;
  new_type: KioskStationType;
  changed_by_uid: string;
}): Promise<{
  station: KioskStation;
  activation: KioskActivation;
  code: string;
} | null> {
  const stationRef = adminDb.doc(`kiosk_stations/${opts.station_id}`);
  const code = generateActivationCode();
  const now = new Date().toISOString();

  const result = await adminDb.runTransaction(async (tx) => {
    const stationSnap = await tx.get(stationRef);
    if (!stationSnap.exists) return null;
    const station = stationSnap.data() as KioskStation;
    if (station.church_id !== opts.church_id) return null;
    if (station.status === "revoked") return null;

    // 1. Update station.type + clear active_token_id (it's about to be revoked).
    tx.update(stationRef, {
      type: opts.new_type,
      active_token_id: null,
    });

    // 2. Revoke the existing active token, if any.
    if (station.active_token_id) {
      tx.update(adminDb.doc(`kiosk_tokens/${station.active_token_id}`), {
        revoked_at: now,
      });
    }

    // 3. Issue a fresh activation code for re-enrollment.
    const activation: KioskActivation = {
      code,
      station_id: opts.station_id,
      church_id: opts.church_id,
      expires_at: new Date(Date.now() + ACTIVATION_TTL_MS).toISOString(),
      consumed_at: null,
      consumed_by_device: null,
      created_at: now,
      created_by_uid: opts.changed_by_uid,
    };
    tx.set(adminDb.doc(`kiosk_activations/${code}`), activation);

    const updatedStation: KioskStation = {
      ...station,
      type: opts.new_type,
      active_token_id: null,
    };
    return { station: updatedStation, activation };
  });

  if (!result) return null;
  return { station: result.station, activation: result.activation, code };
}

// ─── Token verification (used by requireKioskToken) ─────────────────────────

export interface VerifiedKioskToken {
  station: KioskStation;
  tokenId: string;
  /** The token's persisted scope (derived from station type at activation). */
  scope: KioskScope[];
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

  return { station, tokenId, scope: tok.scope };
}
