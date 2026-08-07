// src/db/albumsRepo.js — added getAlbumsByArtistId, everything else unchanged
import { getDb } from "./db.js";
import { makeId, normalize } from "../utils/id.js";

/**
 * Albums are disambiguated by (nameLower, artistId) rather than name alone,
 * so two different artists' self-titled albums don't collide.
 */
export async function getOrCreateAlbum({ name, artistId, year, artworkId }) {
  if (!name) return null;
  const db = await getDb();
  const nameLower = normalize(name);
  const candidates = await db.getAllFromIndex(
    "albums",
    "byNameLower",
    nameLower,
  );
  const existing = candidates.find((a) => a.artistId === artistId);
  if (existing) {
    // Backfill artwork/year if this pass has data the stored record lacks.
    let changed = false;
    if (!existing.artworkId && artworkId) {
      existing.artworkId = artworkId;
      changed = true;
    }
    if (!existing.year && year) {
      existing.year = year;
      changed = true;
    }
    if (changed) await db.put("albums", existing);
    return existing;
  }

  const album = {
    id: makeId("album"),
    name: name.trim(),
    nameLower,
    artistId: artistId || null,
    year: year || null,
    artworkId: artworkId || null,
    songCount: 0,
  };
  await db.add("albums", album);
  if (artistId) {
    const db2 = await getDb();
    const tx = db2.transaction("artists", "readwrite");
    const artist = await tx.store.get(artistId);
    if (artist) {
      artist.albumCount = (artist.albumCount || 0) + 1;
      await tx.store.put(artist);
    }
    await tx.done;
  }
  return album;
}

export async function adjustAlbumSongCount(albumId, delta) {
  if (!albumId) return;
  const db = await getDb();
  const tx = db.transaction("albums", "readwrite");
  const album = await tx.store.get(albumId);
  if (album) {
    album.songCount = Math.max(0, (album.songCount || 0) + delta);
    await tx.store.put(album);
  }
  await tx.done;
}

export async function getAlbum(id) {
  const db = await getDb();
  return db.get("albums", id);
}

export async function getAllAlbums() {
  const db = await getDb();
  return db.getAll("albums");
}

/** An artist's full discography, for the Artist view. */
export async function getAlbumsByArtistId(artistId) {
  const db = await getDb();
  return db.getAllFromIndex("albums", "byArtistId", artistId);
}
