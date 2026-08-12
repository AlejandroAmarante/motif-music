// src/db/songsRepo.js — full updated file (discovery now bulk-reads/batch-writes instead of one IndexedDB transaction per file; see getSongsMapForDir/seedPlaceholdersBatch/removeSongsBatch)
import { getDb } from "./db.js";
import { makeId, normalize } from "../utils/id.js";
import { adjustArtistSongCount } from "./artistsRepo.js";
import { adjustAlbumSongCount } from "./albumsRepo.js";
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

/**
 * Every song currently indexed under a directory, keyed by path — one
 * IndexedDB read for the whole directory instead of a getByPath() round
 * trip per file. This is what lets scanDirectory() do its new/changed/
 * unchanged comparison entirely in memory: the existence check that used
 * to cost one transaction per file during discovery now costs one
 * transaction total, no matter how many files are in the folder. It also
 * doubles as the source of truth for missing-file detection at the end of
 * a scan (any path left in this map that the walk never visited), so the
 * old separate getPathsForDir() call is gone too.
 */
export async function getSongsMapForDir(dirHandleId) {
  const db = await getDb();
  const songs = await db.getAllFromIndex("songs", "byDirHandle", dirHandleId);
  const map = new Map();
  for (const song of songs) map.set(song.path, song);
  return map;
}

/**
 * Phase 1 of a two-phase scan (see src/library/scanner.js): inserts
 * minimal, immediately-visible rows for brand-new files before any tag/
 * duration/artwork parsing has happened, in ONE transaction for the whole
 * batch rather than one transaction per file — the same reasoning as
 * enrichSongsBatch's own doc comment, applied to discovery instead of
 * enrichment. `pending: 1` is what SongRow reads to show the "still
 * loading" treatment and disable playback until the batched enrichment
 * pass (src/db/batchEnrichRepo.js) fills in the real data. Deliberately
 * does NOT create Artist/Album records yet — we don't know them from a
 * filename alone — so that resolution, and the song-count bookkeeping
 * that goes with it, happens once, during enrichment.
 *
 * Returns the created records in the same order as `items`.
 */
export async function seedPlaceholdersBatch(items) {
  if (!items.length) return [];
  const db = await getDb();
  const tx = db.transaction("songs", "readwrite");
  const store = tx.objectStore("songs");

  const songs = items.map(
    ({ path, dirHandleId, fileName, format, size, lastModified }) => {
      const title = fileName.replace(/\.[^./]+$/, "");
      return {
        id: makeId("song"),
        path,
        dirHandleId,
        fileName,
        format,
        size,
        lastModified,
        title,
        titleLower: normalize(title),
        artist: null,
        artistId: null,
        album: null,
        albumId: null,
        albumArtist: null,
        trackNumber: null,
        discNumber: null,
        genre: [],
        genreIds: [],
        year: null,
        duration: 0,
        bitrate: null,
        sampleRate: null,
        artworkId: null,
        dateAdded: Date.now(),
        lastPlayedAt: null,
        playCount: 0,
        skipCount: 0,
        favorite: 0,
        rating: 0,
        lyrics: null,
        lyricsCheckedAt: null,
        metadataSchemaVersion: METADATA_SCHEMA_VERSION,
        pending: 1,
      };
    },
  );

  for (const song of songs) await store.add(song);
  await tx.done;
  return songs;
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
  // A placeholder never got its artist/album counted (see
  // batchEnrichRepo.js), so don't decrement for one that's removed before
  // enrichment ever runs.
  if (!song.pending) {
    await adjustArtistSongCount(song.artistId, -1);
    if (song.albumId) await adjustAlbumSongCount(song.albumId, -1);
  }
  return song;
}

/**
 * Batched version of removeByPath/removeById for scan-time cleanup of
 * files that disappeared from disk. One transaction for every deletion
 * AND every artist/album count adjustment, no matter how many songs are
 * removed — and since the adjustments are collapsed by unique artist/
 * album id first, deleting an entire 12-track album folder costs one
 * artist update and one album update, not twelve of each.
 */
export async function removeSongsBatch(songs) {
  if (!songs.length) return;
  const db = await getDb();
  const tx = db.transaction(["songs", "artists", "albums"], "readwrite");
  const songsStore = tx.objectStore("songs");
  const artistsStore = tx.objectStore("artists");
  const albumsStore = tx.objectStore("albums");

  const artistDeltas = new Map();
  const albumDeltas = new Map();

  for (const song of songs) {
    await songsStore.delete(song.id);
    if (song.pending) continue; // never counted, see _removeSongRecord's reasoning above
    if (song.artistId)
      artistDeltas.set(
        song.artistId,
        (artistDeltas.get(song.artistId) || 0) - 1,
      );
    if (song.albumId)
      albumDeltas.set(song.albumId, (albumDeltas.get(song.albumId) || 0) - 1);
  }

  for (const [artistId, delta] of artistDeltas) {
    const artist = await artistsStore.get(artistId);
    if (artist) {
      artist.songCount = Math.max(0, (artist.songCount || 0) + delta);
      await artistsStore.put(artist);
    }
  }
  for (const [albumId, delta] of albumDeltas) {
    const album = await albumsStore.get(albumId);
    if (album) {
      album.songCount = Math.max(0, (album.songCount || 0) + delta);
      await albumsStore.put(album);
    }
  }

  await tx.done;
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

/** Every song still flagged pending, across all folders — used to resume an interrupted scan on app load. See src/library/scanner.js's resumePendingEnrichment(). */
export async function getPendingSongs() {
  const db = await getDb();
  return db.getAllFromIndex("songs", "byPending", IDBKeyRange.only(1));
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

/** All songs credited to an artist (as track artist), for the Artist view. */
export async function getByArtistId(artistId) {
  const db = await getDb();
  return db.getAllFromIndex("songs", "byArtistId", artistId);
}

/**
 * Cheap existence/size check for an artist's local catalog — used by the
 * Now Playing "which artist" navigation choice, where we only need to know
 * whether there's more than one track, not the tracks themselves.
 */
export async function countByArtistId(artistId) {
  const db = await getDb();
  return db.countFromIndex("songs", "byArtistId", artistId);
}

/**
 * Lite rows for the fuzzy search index. Pending songs are left out — a
 * bare filename with no artist/album isn't a useful search match yet, and
 * excluding them here means search/filter results never surface a track
 * that SongRow would just show disabled anyway. They join the index
 * automatically once enrichment clears the flag and the index next
 * rebuilds.
 */
export async function getAllLite() {
  const db = await getDb();
  const tx = db.transaction("songs", "readonly");
  const out = [];
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const s = cursor.value;
    if (!s.pending) {
      out.push({
        id: s.id,
        title: s.title,
        titleLower: s.titleLower,
        artist: s.artist,
        album: s.album,
      });
    }
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
