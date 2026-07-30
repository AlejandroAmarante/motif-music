import { getDb } from './db.js';
import { makeId } from '../utils/id.js';

async function hashBytes(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Stores artwork once per unique image, returning the shared artwork id. */
export async function storeArtwork(bytes, mimeType) {
  if (!bytes || bytes.byteLength === 0) return null;
  const hash = await hashBytes(bytes);
  const db = await getDb();
  const existing = await db.getFromIndex('cachedArtwork', 'byHash', hash);
  if (existing) return existing.id;

  const record = {
    id: makeId('art'),
    hash,
    mimeType,
    blob: new Blob([bytes], { type: mimeType })
  };
  await db.add('cachedArtwork', record);
  return record.id;
}

const urlCache = new Map();

/** Returns (and memoizes) an object URL for cached artwork, for <img src>. */
export async function getArtworkUrl(artworkId) {
  if (!artworkId) return null;
  if (urlCache.has(artworkId)) return urlCache.get(artworkId);
  const db = await getDb();
  const record = await db.get('cachedArtwork', artworkId);
  if (!record) return null;
  const url = URL.createObjectURL(record.blob);
  urlCache.set(artworkId, url);
  return url;
}
