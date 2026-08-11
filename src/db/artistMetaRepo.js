import { getDb } from "./db.js";

export async function getArtistMetaCache(key) {
  if (!key) return null;

  const db = await getDb();

  return db.get("artistMeta", key);
}

export async function putArtistMetaCache(entry) {
  const db = await getDb();

  await db.put("artistMeta", entry);

  return entry;
}

/**
 * Removes one artist's metadata cache entry.
 *
 * Useful when a provider's data changes or when an artist needs to
 * be re-resolved without touching the rest of the application's cache.
 */
export async function clearArtistMetaCacheEntry(key) {
  if (!key) return;

  const db = await getDb();

  await db.delete("artistMeta", key);
}

/**
 * Clears all artist metadata cache entries.
 *
 * This intentionally only clears the artistMeta object store. It does
 * not affect songs, albums, cached artwork, settings, or any other
 * Motif data.
 */
export async function clearArtistMetaCache() {
  const db = await getDb();

  await db.clear("artistMeta");
}
