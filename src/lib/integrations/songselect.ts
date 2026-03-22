/**
 * CCLI SongSelect adapter.
 *
 * Searches the SongSelect catalog and imports songs into the church's
 * song library. Uses SongSelect's REST API with session-based auth.
 *
 * Note: SongSelect credentials are stored encrypted on the church
 * document and decrypted only via Admin SDK server-side.
 */

const SONGSELECT_BASE = "https://api.songselect.com/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SongSelectSearchResult {
  songselect_id: string;
  title: string;
  ccli_number: string | null;
  artist_credit: string | null;
  writer_credit: string | null;
  copyright: string | null;
  ccli_publisher: string | null;
  available_keys: string[];
  default_key: string | null;
  themes: string[];
}

export interface SongSelectSongDetail extends SongSelectSearchResult {
  lyrics: string | null;
}

// ---------------------------------------------------------------------------
// Session Management
// ---------------------------------------------------------------------------

interface SongSelectSession {
  access_token: string;
  expires_at: number;
}

const sessionCache = new Map<string, SongSelectSession>();

async function getSession(
  email: string,
  password: string,
): Promise<SongSelectSession> {
  const cacheKey = email;
  const cached = sessionCache.get(cacheKey);
  if (cached && cached.expires_at > Date.now() + 60_000) {
    return cached;
  }

  const res = await fetch(`${SONGSELECT_BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const msg = res.status === 401
      ? "Invalid SongSelect credentials"
      : `SongSelect auth failed (${res.status})`;
    throw new Error(msg);
  }

  const data = await res.json();
  const session: SongSelectSession = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  sessionCache.set(cacheKey, session);
  return session;
}

async function songselectFetch(
  path: string,
  session: SongSelectSession,
): Promise<Response> {
  const res = await fetch(`${SONGSELECT_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      Accept: "application/json",
    },
  });

  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") || "5");
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return fetch(`${SONGSELECT_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/json",
      },
    });
  }

  return res;
}

// ---------------------------------------------------------------------------
// Adapter Methods
// ---------------------------------------------------------------------------

export const songselectAdapter = {
  /**
   * Validate credentials by attempting to authenticate.
   */
  async testConnection(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await getSession(email, password);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("401") || message.includes("403") || message.toLowerCase().includes("unauthorized") || message.toLowerCase().includes("invalid")) {
        return { ok: false, error: "Invalid credentials. Please check your CCLI/SongSelect email and password." };
      }
      return { ok: false, error: `Could not reach SongSelect: ${message}` };
    }
  },

  /**
   * Search the SongSelect catalog by title, CCLI number, or artist.
   */
  async searchSongs(
    email: string,
    password: string,
    query: string,
    limit = 25,
  ): Promise<SongSelectSearchResult[]> {
    const session = await getSession(email, password);
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
    });

    const res = await songselectFetch(`/songs?${params}`, session);
    if (!res.ok) {
      throw new Error(`SongSelect search failed (${res.status})`);
    }

    const data = await res.json();
    const results: SongSelectSearchResult[] = [];

    for (const item of data.songs ?? data.data ?? []) {
      results.push({
        songselect_id: String(item.id ?? item.songselect_id),
        title: item.title ?? "Untitled",
        ccli_number: item.ccli_number ?? item.ccli_song_number ?? null,
        artist_credit: item.artist ?? item.artist_credit ?? null,
        writer_credit: item.writer ?? item.writer_credit ?? null,
        copyright: item.copyright ?? null,
        ccli_publisher: item.publisher ?? item.ccli_publisher ?? null,
        available_keys: item.available_keys ?? [],
        default_key: item.default_key ?? null,
        themes: item.themes ?? item.tags ?? [],
      });
    }

    return results;
  },

  /**
   * Fetch full song detail including lyrics for a specific SongSelect ID.
   */
  async getSongDetail(
    email: string,
    password: string,
    songselectId: string,
  ): Promise<SongSelectSongDetail> {
    const session = await getSession(email, password);
    const res = await songselectFetch(`/songs/${songselectId}`, session);

    if (!res.ok) {
      throw new Error(`SongSelect detail fetch failed (${res.status})`);
    }

    const item = await res.json();
    const song = item.song ?? item.data ?? item;

    return {
      songselect_id: String(song.id ?? songselectId),
      title: song.title ?? "Untitled",
      ccli_number: song.ccli_number ?? song.ccli_song_number ?? null,
      artist_credit: song.artist ?? song.artist_credit ?? null,
      writer_credit: song.writer ?? song.writer_credit ?? null,
      copyright: song.copyright ?? null,
      ccli_publisher: song.publisher ?? song.ccli_publisher ?? null,
      available_keys: song.available_keys ?? [],
      default_key: song.default_key ?? null,
      themes: song.themes ?? song.tags ?? [],
      lyrics: song.lyrics ?? null,
    };
  },
};
