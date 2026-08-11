import { getDb } from "./db.js";
import { makeId } from "../utils/id.js";

/**
 * Split out from storeArtwork() so batchEnrichRepo.js can hash artwork
 * bytes ahead of time during a scan's parallel parse phase.
 *
 * The hash must be ready before results are written inside a shared
 * IndexedDB transaction because awaiting non-IDB operations such as
 * crypto.subtle can cause an open transaction to auto-close.
 */
export async function hashArtworkBytes(bytes) {
  if (!bytes || bytes.byteLength === 0) {
    return null;
  }

  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function storeArtwork(bytes, mimeType) {
  const hash = await hashArtworkBytes(bytes);

  if (!hash) return null;

  const db = await getDb();

  const existing = await db.getFromIndex("cachedArtwork", "byHash", hash);

  if (existing) {
    return existing.id;
  }

  const record = {
    id: makeId("art"),
    hash,
    mimeType,
    blob: new Blob([bytes], {
      type: mimeType,
    }),
  };

  await db.add("cachedArtwork", record);

  return record.id;
}

const urlCache = new Map();

/**
 * Synchronous, non-fetching peek at the in-memory URL cache.
 *
 * Used to avoid a flash to fallback artwork when an already-resolved
 * image is remounted during the current session.
 */
export function peekArtworkUrl(artworkId) {
  if (!artworkId) return null;

  return urlCache.get(artworkId) ?? null;
}

/**
 * Returns and memoizes an object URL for cached artwork.
 */
export async function getArtworkUrl(artworkId) {
  if (!artworkId) return null;

  if (urlCache.has(artworkId)) {
    return urlCache.get(artworkId);
  }

  const db = await getDb();

  const record = await db.get("cachedArtwork", artworkId);

  if (!record) return null;

  const url = URL.createObjectURL(record.blob);

  urlCache.set(artworkId, url);

  return url;
}

export async function getAlbumArtworkCache(key) {
  if (!key) return null;

  const db = await getDb();

  return db.get("albumArtwork", key);
}

export async function putAlbumArtworkCache(entry) {
  const db = await getDb();

  await db.put("albumArtwork", entry);

  return entry;
}
