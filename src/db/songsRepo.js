import { getDb } from './db.js';
import { makeId, normalize } from '../utils/id.js';
import { getOrCreateArtist, adjustArtistSongCount } from './artistsRepo.js';
import { getOrCreateAlbum, adjustAlbumSongCount } from './albumsRepo.js';
import { getOrCreateGenres } from './genresRepo.js';
import { storeArtwork } from './artworkRepo.js';
import { METADATA_SCHEMA_VERSION } from './schema.js';

export async function getByPath(path) {
  const db = await getDb();
  return db.getFromIndex('songs', 'byPath', path);
}

export async function getById(id) {
  const db = await getDb();
  return db.get('songs', id);
}

export async function countSongs() {
  const db = await getDb();
  return db.count('songs');
}

/**
 * Creates or updates a song from a freshly-scanned file. Skips all writes
 * (including artist/album/genre lookups) when size + lastModified match the
 * stored record, which is what makes rescans of a large library cheap.
 */
export async function upsertFromScan({ path, dirHandleId, fileName, format, size, lastModified, tags }) {
  const existing = await getByPath(path);
  if (existing && existing.size === size && existing.lastModified === lastModified) {
    return { status: 'unchanged', song: existing };
  }

  const albumArtistName = tags.albumArtist || tags.artist || 'Unknown Artist';
  const albumArtistRec = await getOrCreateArtist(albumArtistName);
  const trackArtistName = tags.artist || albumArtistName;
  const trackArtistRec =
    trackArtistName === albumArtistName ? albumArtistRec : await getOrCreateArtist(trackArtistName);

  let artworkId = existing?.artworkId ?? null;
  if (tags.artworkBytes) {
    artworkId = await storeArtwork(tags.artworkBytes, tags.artworkMime);
  }

  const album = tags.album
    ? await getOrCreateAlbum({
        name: tags.album,
        artistId: albumArtistRec.id,
        year: tags.year,
        artworkId
      })
    : null;

  const genreIds = await getOrCreateGenres(tags.genre || []);

  const title = tags.title || fileName.replace(/\.[^./]+$/, '');
  const db = await getDb();

  const song = {
    id: existing?.id ?? makeId('song'),
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
    metadataSchemaVersion: METADATA_SCHEMA_VERSION
  };

  await db.put('songs', song);

  if (!existing) {
    await adjustArtistSongCount(trackArtistRec.id, 1);
    if (album) await adjustAlbumSongCount(album.id, 1);
  }

  return { status: existing ? 'updated' : 'created', song };
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
  await db.delete('songs', song.id);
  await adjustArtistSongCount(song.artistId, -1);
  if (song.albumId) await adjustAlbumSongCount(song.albumId, -1);
  return song;
}

/**
 * Flags a song as unavailable (file couldn't be resolved during playback)
 * or clears that flag once it resolves successfully again. This is
 * separate from the scanner's deletion path: a rescan *confirms* absence
 * within an accessible directory and removes the record outright, while
 * this handles the lazier case — the directory itself might be
 * disconnected, so we don't know for certain the file is gone, just that
 * we can't currently reach it.
 */
export async function markMissing(id, missing) {
  const db = await getDb();
  const tx = db.transaction('songs', 'readwrite');
  const song = await tx.store.get(id);
  if (song && Boolean(song.missing) !== missing) {
    song.missing = missing ? 1 : 0;
    await tx.store.put(song);
  }
  await tx.done;
  return song;
}

/**
 * Persists a lyrics lookup result: a real `{synced, text}` object, or
 * `false` to record "checked online, nothing found" so we don't keep
 * re-querying LRCLIB for a track that genuinely has no lyrics there.
 */
export async function setLyrics(id, lyrics) {
  const db = await getDb();
  const tx = db.transaction('songs', 'readwrite');
  const song = await tx.store.get(id);
  if (song) {
    song.lyrics = lyrics;
    await tx.store.put(song);
  }
  await tx.done;
  return song;
}

/** All primary keys for a given root directory, for detecting deletions after a rescan. */
export async function getPathsForDir(dirHandleId) {
  const db = await getDb();
  const songs = await db.getAllFromIndex('songs', 'byDirHandle', dirHandleId);
  return songs.map((s) => s.path);
}

/**
 * Returns song ids in sorted order for a given index, without loading full
 * records — cheap enough to keep entirely in memory even at 250k+ songs,
 * and is what backs virtualized list scrolling (see useVirtualSongList).
 */
export async function getSortedIds(indexName = 'byTitleLower') {
  const db = await getDb();
  return db.getAllKeysFromIndex('songs', indexName);
}

/** Fetches full records for a small visible window of ids (react-window range). */
export async function getByIds(ids) {
  const db = await getDb();
  const tx = db.transaction('songs', 'readonly');
  const results = await Promise.all(ids.map((id) => tx.store.get(id)));
  await tx.done;
  return results.filter(Boolean);
}

/** All songs on a given album, for the Library search "filter to this album" shortcut. */
export async function getByAlbumId(albumId) {
  const db = await getDb();
  return db.getAllFromIndex('songs', 'byAlbumId', albumId);
}

/** Lightweight rows for building the in-memory search index (see search/index.js). */
export async function getAllLite() {
  const db = await getDb();
  const tx = db.transaction('songs', 'readonly');
  const out = [];
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const s = cursor.value;
    out.push({
      id: s.id,
      title: s.title,
      titleLower: s.titleLower,
      artist: s.artist,
      album: s.album
    });
    cursor = await cursor.continue();
  }
  await tx.done;
  return out;
}

async function topFromIndex(indexName, limit, range = null) {
  const db = await getDb();
  const tx = db.transaction('songs', 'readonly');
  const out = [];
  let cursor = await tx.store.index(indexName).openCursor(range, 'prev'); // newest/highest first
  while (cursor && out.length < limit) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return out;
}

export async function getRecentlyAdded(limit = 20) {
  return topFromIndex('byDateAdded', limit);
}

export async function getFavorites(limit = 50) {
  return topFromIndex('byFavorite', limit, IDBKeyRange.only(1));
}

export async function getTopPlayed(limit = 20) {
  const songs = await topFromIndex('byPlayCount', limit, IDBKeyRange.lowerBound(1));
  return songs;
}

export async function recordPlay(id, { completed = true } = {}) {
  const db = await getDb();
  const tx = db.transaction('songs', 'readwrite');
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
  const tx = db.transaction('songs', 'readwrite');
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
  const tx = db.transaction('songs', 'readwrite');
  const song = await tx.store.get(id);
  if (song) {
    song.rating = rating;
    await tx.store.put(song);
  }
  await tx.done;
  return song;
}
