import { getDb } from "./db.js";
import { makeId, normalize } from "../utils/id.js";
import { getOrCreateArtist, adjustArtistSongCount } from "./artistsRepo.js";
import { getOrCreateAlbum, adjustAlbumSongCount } from "./albumsRepo.js";
import { getOrCreateGenres } from "./genresRepo.js";
import { storeArtwork } from "./artworkRepo.js";
import { METADATA_SCHEMA_VERSION } from "./schema.js";

export async function getByPath(path) {
  const db = await getDb();
  return db.getFromIndex("songs", "byPath", path);
}

export async function getById(id) {
  const db = await getDb();
  return db.get("songs", id);
}

export async function countSongs() {
  const db = await getDb();
  return db.count("songs");
}

export async function upsertFromScan({
  path,
  dirHandleId,
  fileName,
  format,
  size,
  lastModified,
  tags,
}) {
  const existing = await getByPath(path);
  if (
    existing &&
    existing.size === size &&
    existing.lastModified === lastModified
  ) {
    return { status: "unchanged", song: existing };
  }

  const albumArtistName = tags.albumArtist || tags.artist || "Unknown Artist";
  const albumArtistRec = await getOrCreateArtist(albumArtistName);
  const trackArtistName = tags.artist || albumArtistName;
  const trackArtistRec =
    trackArtistName === albumArtistName
      ? albumArtistRec
      : await getOrCreateArtist(trackArtistName);

  let artworkId = existing?.artworkId ?? null;
  if (tags.artworkBytes) {
    artworkId = await storeArtwork(tags.artworkBytes, tags.artworkMime);
  }

  const album = tags.album
    ? await getOrCreateAlbum({
        name: tags.album,
        artistId: albumArtistRec.id,
        year: tags.year,
        artworkId,
      })
    : null;

  const genreIds = await getOrCreateGenres(tags.genre || []);

  const title = tags.title || fileName.replace(/\.[^./]+$/, "");
  const db = await getDb();

  const song = {
    id: existing?.id ?? makeId("song"),
    path,
    dirHandleId,
    fileName,
    format,
    size,
    lastModified,
    title,
    titleLower: normalize(title),
    artist: trackArtistName,
    artistId: trackArtistRec.id,
    album: tags.album || null,
    albumId: album?.id ?? null,
    albumArtist: albumArtistName,
    trackNumber: tags.trackNumber ?? null,
    discNumber: tags.discNumber ?? null,
    genre: tags.genre || [],
    genreIds,
    year: tags.year ?? null,
    duration: tags.duration ?? 0,
    bitrate: tags.bitrate ?? null,
    sampleRate: tags.sampleRate ?? null,
    artworkId,
    dateAdded: existing?.dateAdded ?? Date.now(),
    lastPlayedAt: existing?.lastPlayedAt ?? null,
    playCount: existing?.playCount ?? 0,
    skipCount: existing?.skipCount ?? 0,
    favorite: existing?.favorite ?? 0, // 0/1, not boolean — IndexedDB index keys can't be booleans
    rating: existing?.rating ?? 0,
    lyrics: tags.lyrics ?? null, // { synced: [{time,text}]|null, text: string|null } | null
    lyricsCheckedAt: existing?.lyricsCheckedAt ?? null, // ms epoch — last time we asked LRCLIB, used to throttle retries on a confirmed-missing result
    metadataSchemaVersion: METADATA_SCHEMA_VERSION,
  };

  await db.put("songs", song);

  if (!existing) {
    await adjustArtistSongCount(trackArtistRec.id, 1);
    if (album) await adjustAlbumSongCount(album.id, 1);
  }

  return { status: existing ? "updated" : "created", song };
}

/** Removes a song that scanning discovered is no longer on disk. */
export async function removeByPath(path) {
  const song = await getByPath(path);
  if (!song) return null;
  return _removeSongRecord(song);
}

/** Same cleanup as removeByPath, keyed by id — used when a playback attempt (not a rescan) confirms a file is gone. */
export async function removeById(id) {
  const song = await getById(id);
  if (!song) return null;
  return _removeSongRecord(song);
}

async function _removeSongRecord(song) {
  const db = await getDb();
  await db.delete("songs", song.id);
  await adjustArtistSongCount(song.artistId, -1);
  if (song.albumId) await adjustAlbumSongCount(song.albumId, -1);
  return song;
}

export async function markMissing(id, missing) {
  const db = await getDb();
  const tx = db.transaction("songs", "readwrite");
  const song = await tx.store.get(id);
  if (song && Boolean(song.missing) !== missing) {
    song.missing = missing ? 1 : 0;
    await tx.store.put(song);
  }
  await tx.done;
  return song;
}

/**
 * Persists a lyrics result — found, or a confirmed `false` ("LRCLIB has
 * nothing for this track") — and always stamps `lyricsCheckedAt` with the
 * current time. That stamp is what lets AudioEngine's retry-on-play logic
 * throttle itself (see LYRICS_RECHECK_COOLDOWN_MS in lrclib.js) instead of
 * re-querying LRCLIB every single time a lyrics-less song is played.
 */
export async function setLyrics(id, lyrics) {
  const db = await getDb();
  const tx = db.transaction("songs", "readwrite");
  const song = await tx.store.get(id);
  if (song) {
    song.lyrics = lyrics;
    song.lyricsCheckedAt = Date.now();
    await tx.store.put(song);
  }
  await tx.done;
  return song;
}

export async function getPathsForDir(dirHandleId) {
  const db = await getDb();
  const songs = await db.getAllFromIndex("songs", "byDirHandle", dirHandleId);
  return songs.map((s) => s.path);
}

export async function getSortedIds(indexName = "byTitleLower") {
  const db = await getDb();
  return db.getAllKeysFromIndex("songs", indexName);
}

export async function getByIds(ids) {
  const db = await getDb();
  const tx = db.transaction("songs", "readonly");
  const results = await Promise.all(ids.map((id) => tx.store.get(id)));
  await tx.done;
  return results.filter(Boolean);
}

export async function getByAlbumId(albumId) {
  const db = await getDb();
  return db.getAllFromIndex("songs", "byAlbumId", albumId);
}

export async function getAllLite() {
  const db = await getDb();
  const tx = db.transaction("songs", "readonly");
  const out = [];
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const s = cursor.value;
    out.push({
      id: s.id,
      title: s.title,
      titleLower: s.titleLower,
      artist: s.artist,
      album: s.album,
    });
    cursor = await cursor.continue();
  }
  await tx.done;
  return out;
}

async function topFromIndex(indexName, limit, range = null) {
  const db = await getDb();
  const tx = db.transaction("songs", "readonly");
  const out = [];
  let cursor = await tx.store.index(indexName).openCursor(range, "prev"); // newest/highest first
  while (cursor && out.length < limit) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return out;
}

export async function getRecentlyAdded(limit = 20) {
  return topFromIndex("byDateAdded", limit);
}

export async function getFavorites(limit = 50) {
  return topFromIndex("byFavorite", limit, IDBKeyRange.only(1));
}

export async function getTopPlayed(limit = 20) {
  const songs = await topFromIndex(
    "byPlayCount",
    limit,
    IDBKeyRange.lowerBound(1),
  );
  return songs;
}

export async function recordPlay(id, { completed = true } = {}) {
  const db = await getDb();
  const tx = db.transaction("songs", "readwrite");
  const song = await tx.store.get(id);
  if (song) {
    if (completed) {
      song.playCount += 1;
      song.lastPlayedAt = Date.now();
    } else {
      song.skipCount += 1;
    }
    await tx.store.put(song);
  }
  await tx.done;
  return song;
}

export async function toggleFavorite(id) {
  const db = await getDb();
  const tx = db.transaction("songs", "readwrite");
  const song = await tx.store.get(id);
  if (song) {
    song.favorite = song.favorite ? 0 : 1;
    await tx.store.put(song);
  }
  await tx.done;
  return song;
}

export async function setRating(id, rating) {
  const db = await getDb();
  const tx = db.transaction("songs", "readwrite");
  const song = await tx.store.get(id);
  if (song) {
    song.rating = rating;
    await tx.store.put(song);
  }
  await tx.done;
  return song;
}

/**
 * Backfills artworkId onto the album record and every song in it, once the
 * artwork pipeline resolves online art for an album that had none
 * embedded. After this, the normal artworkId-based render path (Artwork
 * component → useArtworkUrl) picks it up directly with zero further
 * lookups — this is what makes a resolved album "free" from then on.
 */
export async function applyArtworkToAlbum(albumId, artworkId) {
  if (!albumId || !artworkId) return;
  const db = await getDb();
  const tx = db.transaction(["songs", "albums"], "readwrite");
  const songsStore = tx.objectStore("songs");
  const albumsStore = tx.objectStore("albums");

  const album = await albumsStore.get(albumId);
  if (album && !album.artworkId) {
    album.artworkId = artworkId;
    await albumsStore.put(album);
  }

  const songs = await songsStore.index("byAlbumId").getAll(albumId);
  for (const song of songs) {
    if (!song.artworkId) {
      song.artworkId = artworkId;
      await songsStore.put(song);
    }
  }
  await tx.done;
}
