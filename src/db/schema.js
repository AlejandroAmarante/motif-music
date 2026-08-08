// src/db/schema.js — DB_VERSION bumped 3 → 4
// Motif database schema.
//
// This is a *concrete* IndexedDB layer, not an abstracted "storage driver"
// interface — per the architecture principle, we don't introduce a swappable
// storage abstraction until a real migration need appears. Bump DB_VERSION
// and add an `if (oldVersion < N)` block in `upgrade()` for future changes;
// never mutate a released version's store definitions in place.

export const DB_NAME = "motif";
export const DB_VERSION = 4;

// versioned metadata schema tag stored per-song, independent of DB_VERSION —
// this is what lets the metadata *shape* evolve (new extracted fields) without
// forcing an IndexedDB migration for every tag we learn to read.
export const METADATA_SCHEMA_VERSION = 1;

/**
 * @param {import('idb').IDBPDatabase} db
 * @param {number} oldVersion
 * @param {number | null} newVersion
 * @param {import('idb').IDBPTransaction} transaction
 */
export function upgrade(db, oldVersion, newVersion, transaction) {
  if (oldVersion < 1) {
    // --- Library core ---
    const songs = db.createObjectStore("songs", { keyPath: "id" });
    songs.createIndex("byPath", "path", { unique: true });
    songs.createIndex("byDirHandle", "dirHandleId");
    songs.createIndex("byArtistId", "artistId");
    songs.createIndex("byAlbumId", "albumId");
    songs.createIndex("byGenre", "genre", { multiEntry: true });
    songs.createIndex("byTitleLower", "titleLower");
    songs.createIndex("byDateAdded", "dateAdded");
    songs.createIndex("byLastPlayedAt", "lastPlayedAt");
    songs.createIndex("byFavorite", "favorite");
    songs.createIndex("byPlayCount", "playCount");

    const artists = db.createObjectStore("artists", { keyPath: "id" });
    artists.createIndex("byNameLower", "nameLower", { unique: true });

    const albums = db.createObjectStore("albums", { keyPath: "id" });
    albums.createIndex("byNameLower", "nameLower");
    albums.createIndex("byArtistId", "artistId");
    albums.createIndex("byYear", "year");

    const genres = db.createObjectStore("genres", { keyPath: "id" });
    genres.createIndex("byNameLower", "nameLower", { unique: true });

    // --- Filesystem ---
    const dirHandles = db.createObjectStore("directoryHandles", {
      keyPath: "id",
    });
    dirHandles.createIndex("byName", "name");

    // --- Playlists ---
    const playlists = db.createObjectStore("playlists", { keyPath: "id" });
    playlists.createIndex("byUpdatedAt", "updatedAt");
    playlists.createIndex("byType", "type"); // 'manual' | 'smart' | 'generated'

    // --- Listening activity ---
    const playHistory = db.createObjectStore("playHistory", {
      keyPath: "id",
      autoIncrement: true,
    });
    playHistory.createIndex("bySongId", "songId");
    playHistory.createIndex("byPlayedAt", "playedAt");

    // --- Caches ---
    const artwork = db.createObjectStore("cachedArtwork", { keyPath: "id" });
    artwork.createIndex("byHash", "hash", { unique: true });

    const recommendations = db.createObjectStore("cachedRecommendations", {
      keyPath: "id",
    });
    recommendations.createIndex("byType", "type");
    recommendations.createIndex("byGeneratedAt", "generatedAt");

    // --- App-level key/value (schema version, scan cursors, settings) ---
    db.createObjectStore("meta", { keyPath: "key" });
  }

  if (oldVersion < 2) {
    // --- Album-level artwork resolution cache (see src/artwork/artworkManager.js) ---
    // Keyed by Motif's own album id — already guaranteed unique per
    // (artist, album) by albumsRepo.getOrCreateAlbum — rather than a
    // re-derived string or an MBID we may not have yet. One row per album:
    // either a resolved result (artworkId and/or artworkUrl, provider,
    // mbid once known) or a cached failure with a retry cooldown.
    db.createObjectStore("albumArtwork", { keyPath: "key" });
  }

  if (oldVersion < 3) {
    // --- Artist page enrichment cache (see src/artwork/artistMetaManager.js) ---
    // Keyed by Motif's own artist id. Holds a resolved photo (a remote
    // Last.fm URL, or a local fallback artworkId borrowed from one of the
    // artist's own albums), a handful of genre tags, and a bio snippet —
    // or a cached failure with a retry cooldown, same shape as
    // albumArtwork above.
    db.createObjectStore("artistMeta", { keyPath: "key" });

    // --- Album page enrichment cache (see src/artwork/albumMetaManager.js) ---
    // Keyed by Motif's own album id. Holds supplementary release info
    // (release date, country, status) resolved from MusicBrainz — or a
    // cached failure with a retry cooldown.
    db.createObjectStore("albumMeta", { keyPath: "key" });
  }

  if (oldVersion < 4) {
    // --- Two-phase scanning (see src/library/scanner.js) ---
    // A newly-discovered file gets a lightweight placeholder row the
    // instant it's found, flagged `pending: 1`, so it's visible (see
    // SongRow's pending treatment) before its tags/duration/artwork have
    // actually been read. This index isn't on the render hot path — a
    // rendered row already has the flag on the record it was handed — it
    // exists so a scan interrupted mid-enrichment (tab closed, etc.) can
    // find and finish whatever's still unfinished on next load, instead
    // of leaving songs stuck pending forever. Added to the existing
    // `songs` store via the upgrade transaction rather than
    // db.createObjectStore, since the store itself already exists.
    const songs = transaction.objectStore("songs");
    songs.createIndex("byPending", "pending");
  }
}
