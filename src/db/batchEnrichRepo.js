// src/db/batchEnrichRepo.js — accepts an optional shared cache set so a scan spanning many batches (or many folders) doesn't repeat an index lookup for an artist/album/genre it already resolved earlier in the same scan
import { getDb } from "./db.js";
import { makeId, normalize } from "../utils/id.js";
import { METADATA_SCHEMA_VERSION } from "./schema.js";

/**
 * Creates a fresh set of the four resolution caches enrichSongsBatch()
 * uses. Callers that process many batches in one logical scan (see
 * scanner.js) should create ONE of these up front and pass it to every
 * enrichSongsBatch() call in that scan, instead of letting each batch
 * start from empty caches. Sharing them is safe: each call still tracks
 * its own touched-records set and commits those in its own transaction
 * (see touchedArtists/touchedAlbums below), so a cached record's counts
 * keep accumulating correctly across batches even though the object
 * reference is reused — the alternative (fresh caches per batch) just
 * means re-querying an index for an artist/album/genre this same scan
 * already looked up. The payoff scales with how much the library shares
 * artists and albums across batch boundaries, which for a real library
 * (an artist with several albums, various-artists compilations, etc.) is
 * the common case, not the exception.
 */
export function createEnrichmentCaches() {
  return {
    artistCache: new Map(),
    albumCache: new Map(),
    genreCache: new Map(),
    artworkCache: new Map(),
  };
}

/**
 * The batched write path behind a scan's enrichment phase (see
 * src/library/scanner.js). Resolving and writing a single song used to
 * cost it roughly 15-20 separate IndexedDB transactions — one each for
 * the track artist, the album artist, the album (plus a *nested*
 * transaction just to bump that artist's albumCount), one per genre tag,
 * one for artwork, the song write itself, then two more for the
 * song-count bookkeeping after. At real library sizes that transaction
 * overhead dominated actual tag-parsing time, which is what made
 * "reading tags" feel slow even though the parsing itself wasn't.
 *
 * This resolves and writes an entire batch — artist/album/genre
 * resolution, artwork dedup, every song, and all count bookkeeping — in
 * ONE transaction, matched against an in-memory cache for the duration of
 * the call. Songs discovered together overwhelmingly share an
 * artist/album (an album's worth of tracks, scanned in the same pass), so
 * that cache does most of the work; a 500-song, one-album import now
 * costs one artist lookup and one album lookup, not 500 of each.
 *
 * `items`: array of { path, dirHandleId, fileName, format, size,
 * lastModified, tags, artworkHash }. `artworkHash` must already be
 * computed (see hashArtworkBytes in artworkRepo.js) for the same reason
 * noted there — nothing in here awaits anything but this transaction's
 * own requests once it's open.
 *
 * `sharedCaches`: optional, from createEnrichmentCaches() above. Pass the
 * same object across every batch in a scan to let resolution persist
 * across batch boundaries instead of resetting every WRITE_BATCH_SIZE
 * songs. Omit it (or pass null) for a one-off batch that should use
 * fresh, call-scoped caches, same as before.
 *
 * Returns one result per input item, same order: either
 * { ok: true, song, isNew } or { ok: false, path, error }. A single bad
 * item is caught and skipped without losing the rest of the batch's
 * writes.
 */
export async function enrichSongsBatch(items, sharedCaches = null) {
  if (!items.length) return [];

  const db = await getDb();
  const tx = db.transaction(
    ["songs", "artists", "albums", "genres", "cachedArtwork"],
    "readwrite",
  );
  const songsStore = tx.objectStore("songs");
  const artistsStore = tx.objectStore("artists");
  const albumsStore = tx.objectStore("albums");
  const genresStore = tx.objectStore("genres");
  const artworkStore = tx.objectStore("cachedArtwork");

  // Scoped to this call by default, or shared across the whole scan when
  // sharedCaches is provided — every song in the batch (or the scan) that
  // shares an artist/album/genre/artwork resolves against these instead
  // of hitting the index again.
  const artistCache = sharedCaches?.artistCache ?? new Map(); // nameLower -> live artist record
  const albumCache = sharedCaches?.albumCache ?? new Map(); // `${nameLower}::${artistId}` -> live album record
  const genreCache = sharedCaches?.genreCache ?? new Map(); // nameLower -> live genre record
  const artworkCache = sharedCaches?.artworkCache ?? new Map(); // hash -> artworkId

  // Records mutated in place as counts change through the loop below,
  // written once each at the very end rather than after every song.
  const touchedArtists = new Set();
  const touchedAlbums = new Set();

  async function resolveArtist(name) {
    const nameLower = normalize(name);
    const cached = artistCache.get(nameLower);
    if (cached) return cached;
    let artist = await artistsStore.index("byNameLower").get(nameLower);
    if (!artist) {
      artist = {
        id: makeId("artist"),
        name: name.trim(),
        nameLower,
        songCount: 0,
        albumCount: 0,
      };
      await artistsStore.add(artist);
    }
    artistCache.set(nameLower, artist);
    return artist;
  }

  async function resolveAlbum(name, artistRec, year, artworkId) {
    const nameLower = normalize(name);
    const cacheKey = `${nameLower}::${artistRec?.id ?? ""}`;
    let album = albumCache.get(cacheKey);
    if (!album) {
      const candidates = await albumsStore
        .index("byNameLower")
        .getAll(nameLower);
      album = candidates.find((a) => a.artistId === (artistRec?.id ?? null));
      if (!album) {
        album = {
          id: makeId("album"),
          name: name.trim(),
          nameLower,
          artistId: artistRec?.id ?? null,
          year: year || null,
          artworkId: artworkId || null,
          songCount: 0,
        };
        await albumsStore.add(album);
        if (artistRec) {
          artistRec.albumCount = (artistRec.albumCount || 0) + 1;
          touchedArtists.add(artistRec);
        }
      }
      albumCache.set(cacheKey, album);
    }
    // Backfill artwork/year if this pass has data the record still lacks
    // (same behavior getOrCreateAlbum had).
    let changed = false;
    if (!album.artworkId && artworkId) {
      album.artworkId = artworkId;
      changed = true;
    }
    if (!album.year && year) {
      album.year = year;
      changed = true;
    }
    if (changed) touchedAlbums.add(album);
    return album;
  }

  async function resolveGenres(names = []) {
    const ids = [];
    for (const raw of names) {
      const name = raw?.trim();
      if (!name) continue;
      const nameLower = normalize(name);
      let genre = genreCache.get(nameLower);
      if (!genre) {
        genre = await genresStore.index("byNameLower").get(nameLower);
        if (!genre) {
          genre = { id: makeId("genre"), name, nameLower, songCount: 0 };
          await genresStore.add(genre);
        }
        genreCache.set(nameLower, genre);
      }
      ids.push(genre.id);
    }
    return ids;
  }

  async function resolveArtwork(hash, bytes, mimeType) {
    if (!hash) return null;
    const cached = artworkCache.get(hash);
    if (cached) return cached;
    const existing = await artworkStore.index("byHash").get(hash);
    if (existing) {
      artworkCache.set(hash, existing.id);
      return existing.id;
    }
    const record = {
      id: makeId("art"),
      hash,
      mimeType,
      blob: new Blob([bytes], { type: mimeType }),
    };
    await artworkStore.add(record);
    artworkCache.set(hash, record.id);
    return record.id;
  }

  const results = [];

  for (const item of items) {
    const {
      path,
      dirHandleId,
      fileName,
      format,
      size,
      lastModified,
      tags,
      artworkHash,
    } = item;
    try {
      const existing = await songsStore.index("byPath").get(path);
      const wasPending = Boolean(existing?.pending);

      const albumArtistName =
        tags.albumArtist || tags.artist || "Unknown Artist";
      const albumArtistRec = await resolveArtist(albumArtistName);
      const trackArtistName = tags.artist || albumArtistName;
      const trackArtistRec =
        trackArtistName === albumArtistName
          ? albumArtistRec
          : await resolveArtist(trackArtistName);

      let artworkId = existing?.artworkId ?? null;
      if (artworkHash) {
        artworkId = await resolveArtwork(
          artworkHash,
          tags.artworkBytes,
          tags.artworkMime,
        );
      }

      const album = tags.album
        ? await resolveAlbum(tags.album, albumArtistRec, tags.year, artworkId)
        : null;

      const genreIds = await resolveGenres(tags.genre || []);

      const title = tags.title || fileName.replace(/\.[^./]+$/, "");

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
        favorite: existing?.favorite ?? 0,
        rating: existing?.rating ?? 0,
        lyrics: tags.lyrics ?? null,
        lyricsCheckedAt: existing?.lyricsCheckedAt ?? null,
        metadataSchemaVersion: METADATA_SCHEMA_VERSION,
        pending: 0,
      };

      await songsStore.put(song);

      if (!existing || wasPending) {
        trackArtistRec.songCount = (trackArtistRec.songCount || 0) + 1;
        touchedArtists.add(trackArtistRec);
        if (album) {
          album.songCount = (album.songCount || 0) + 1;
          touchedAlbums.add(album);
        }
      }

      results.push({ ok: true, song, isNew: !existing });
    } catch (err) {
      results.push({ ok: false, path, error: err });
    }
  }

  for (const artist of touchedArtists) await artistsStore.put(artist);
  for (const album of touchedAlbums) await albumsStore.put(album);

  await tx.done;
  return results;
}
