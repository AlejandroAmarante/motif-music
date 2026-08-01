import { parseLrc } from './lyrics.js';

const API_BASE = 'https://lrclib.net/api';

function toLyricsShape(record) {
  if (!record || record.instrumental) return null;
  if (record.syncedLyrics) {
    const synced = parseLrc(record.syncedLyrics);
    if (synced) return { synced, text: synced.map((l) => l.text).join('\n') };
  }
  if (record.plainLyrics) return { synced: null, text: record.plainLyrics };
  return null;
}

async function searchFallback({ title, artist }) {
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    const res = await fetch(`${API_BASE}/search?${params.toString()}`);
    if (!res.ok) return false; // reached LRCLIB, nothing usable
    const results = await res.json();
    const best = Array.isArray(results) ? results.find((r) => r.syncedLyrics || r.plainLyrics) : null;
    return best ? toLyricsShape(best) ?? false : false;
  } catch (err) {
    console.warn('[motif/lyrics] LRCLIB search fallback failed:', err.message);
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
 *    track; safe to cache so we don't ask again
 *  - `null` — the lookup couldn't be completed (network/CORS/etc.); do NOT
 *    cache this as "unavailable", the caller should be able to retry later
 */
export async function fetchLrclibLyrics({ title, artist, album, duration }) {
  if (!title || !artist) return null;
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (album) params.set('album_name', album);
    if (duration) params.set('duration', String(Math.round(duration)));

    const res = await fetch(`${API_BASE}/get?${params.toString()}`);
    if (res.status === 404) return searchFallback({ title, artist });
    if (!res.ok) return null;
    const data = await res.json();
    return toLyricsShape(data) ?? false;
  } catch (err) {
    console.warn('[motif/lyrics] LRCLIB lookup failed:', err.message);
    return null;
  }
}
