import { getDb } from './db.js';
import { makeId, normalize } from '../utils/id.js';

/** Finds an artist by name (creating one if needed) within an existing tx-less flow. */
export async function getOrCreateArtist(name) {
  if (!name) return null;
  const db = await getDb();
  const nameLower = normalize(name);
  const existing = await db.getFromIndex('artists', 'byNameLower', nameLower);
  if (existing) return existing;

  const artist = {
    id: makeId('artist'),
    name: name.trim(),
    nameLower,
    songCount: 0,
    albumCount: 0
  };
  await db.add('artists', artist);
  return artist;
}

export async function adjustArtistSongCount(artistId, delta) {
  if (!artistId) return;
  const db = await getDb();
  const tx = db.transaction('artists', 'readwrite');
  const artist = await tx.store.get(artistId);
  if (artist) {
    artist.songCount = Math.max(0, (artist.songCount || 0) + delta);
    await tx.store.put(artist);
  }
  await tx.done;
}

export async function getArtist(id) {
  const db = await getDb();
  return db.get('artists', id);
}

export async function getAllArtists() {
  const db = await getDb();
  return db.getAll('artists');
}
