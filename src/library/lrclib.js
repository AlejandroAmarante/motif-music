import { parseLrc } from "./lyrics.js";

const API_BASE = "https://lrclib.net/api";

// LRCLIB requires every client to self-identify (https://lrclib.net/docs).
// Browsers won't let JS set the `User-Agent` header directly, so this uses
// their documented fallback header instead. Update these three constants
// to match this project's real name/version/homepage before shipping.
const CLIENT_NAME = "Motif";
const CLIENT_VERSION = "0.1.0";
const CLIENT_HOMEPAGE = "https://github.com/REPLACE-ME/motif"; // TODO: real project URL

const CLIENT_HEADERS = {
  "Lrclib-Client": `${CLIENT_NAME} v${CLIENT_VERSION} (${CLIENT_HOMEPAGE})`,
};

// A confirmed "no lyrics for this track" result is cached with a
// timestamp (see songsRepo.setLyrics), and AudioEngine won't hit LRCLIB
// again for that track until this much time has passed — otherwise a song
// with no lyrics would fire a fresh request to a free, community-run API
// every single time it's played.
export const LYRICS_RECHECK_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

function toLyricsShape(record) {
  if (!record || record.instrumental) return null;
  if (record.syncedLyrics) {
    const synced = parseLrc(record.syncedLyrics);
    if (synced) return { synced, text: synced.map((l) => l.text).join("\n") };
  }
  if (record.plainLyrics) return { synced: null, text: record.plainLyrics };
  return null;
}

async function searchFallback({ title, artist }) {
  try {
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist,
    });
    const res = await fetch(`${API_BASE}/search?${params.toString()}`, {
      headers: CLIENT_HEADERS,
    });
    if (!res.ok) return false; // reached LRCLIB, nothing usable
    const results = await res.json();
    const best = Array.isArray(results)
      ? results.find((r) => r.syncedLyrics || r.plainLyrics)
      : null;
    return best ? (toLyricsShape(best) ?? false) : false;
  } catch (err) {
    console.warn("[motif/lyrics] LRCLIB search fallback failed:", err.message);
    return null;
  }
}

/**
 * Looks up lyrics on LRCLIB (https://lrclib.net/docs) for a track with no
 * local lyrics. Only called lazily, on demand — never during a bulk scan —
 * out of respect for a free community-run API.
 *
 * Returns one of three things, which matters for what the caller persists:
 *  - a lyrics object `{ synced, text }` — found, safe to cache
 *  - `false` — LRCLIB was reached and confirmed it has nothing for this
 *    track; safe to cache so we don't ask again (subject to the cooldown
 *    above, enforced by the caller)
 *  - `null` — the lookup couldn't be completed (network/CORS/etc.); do NOT
 *    cache this as "unavailable", the caller should be able to retry later
 */
export async function fetchLrclibLyrics({ title, artist, album, duration }) {
  if (!title || !artist) return null;
  try {
    const params = new URLSearchParams({
      track_name: title,
      artist_name: artist,
    });
    if (album) params.set("album_name", album);
    if (duration) params.set("duration", String(Math.round(duration)));

    const res = await fetch(`${API_BASE}/get?${params.toString()}`, {
      headers: CLIENT_HEADERS,
    });
    if (res.status === 404) return searchFallback({ title, artist });
    if (!res.ok) return null;
    const data = await res.json();
    return toLyricsShape(data) ?? false;
  } catch (err) {
    console.warn("[motif/lyrics] LRCLIB lookup failed:", err.message);
    return null;
  }
}
