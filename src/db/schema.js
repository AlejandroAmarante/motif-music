// Motif database schema.
//
// This is a *concrete* IndexedDB layer, not an abstracted "storage driver"
// interface — per the architecture principle, we don't introduce a swappable
// storage abstraction until a real migration need appears. Bump DB_VERSION
// and add an `if (oldVersion < N)` block in `upgrade()` for future changes;
// never mutate a released version's store definitions in place.

export const DB_NAME = 'motif';
export const DB_VERSION = 1;

// versioned metadata schema tag stored per-song, independent of DB_VERSION —
// this is what lets the metadata *shape* evolve (new extracted fields) without
// forcing an IndexedDB migration for every tag we learn to read.
export const METADATA_SCHEMA_VERSION = 1;

/**
 * @param {import('idb').IDBPDatabase} db
 * @param {number} oldVersion
 */
export function upgrade(db, oldVersion) {
  if (oldVersion < 1) {
    // --- Library core ---
    const songs = db.createObjectStore('songs', { keyPath: 'id' });
    songs.createIndex('byPath', 'path', { unique: true });
    songs.createIndex('byDirHandle', 'dirHandleId');
    songs.createIndex('byArtistId', 'artistId');
    songs.createIndex('byAlbumId', 'albumId');
    songs.createIndex('byGenre', 'genre', { multiEntry: true });
    songs.createIndex('byTitleLower', 'titleLower');
    songs.createIndex('byDateAdded', 'dateAdded');
    songs.createIndex('byLastPlayedAt', 'lastPlayedAt');
    songs.createIndex('byFavorite', 'favorite');
    songs.createIndex('byPlayCount', 'playCount');

    const artists = db.createObjectStore('artists', { keyPath: 'id' });
    artists.createIndex('byNameLower', 'nameLower', { unique: true });

    const albums = db.createObjectStore('albums', { keyPath: 'id' });
    albums.createIndex('byNameLower', 'nameLower');
    albums.createIndex('byArtistId', 'artistId');
    albums.createIndex('byYear', 'year');

    const genres = db.createObjectStore('genres', { keyPath: 'id' });
    genres.createIndex('byNameLower', 'nameLower', { unique: true });

    // --- Filesystem ---
    const dirHandles = db.createObjectStore('directoryHandles', { keyPath: 'id' });
    dirHandles.createIndex('byName', 'name');

    // --- Playlists ---
    const playlists = db.createObjectStore('playlists', { keyPath: 'id' });
    playlists.createIndex('byUpdatedAt', 'updatedAt');
    playlists.createIndex('byType', 'type'); // 'manual' | 'smart' | 'generated'

    // --- Listening activity ---
    const playHistory = db.createObjectStore('playHistory', {
      keyPath: 'id',
      autoIncrement: true
    });
    playHistory.createIndex('bySongId', 'songId');
    playHistory.createIndex('byPlayedAt', 'playedAt');

    // --- Caches ---
    const artwork = db.createObjectStore('cachedArtwork', { keyPath: 'id' });
    artwork.createIndex('byHash', 'hash', { unique: true });

    const recommendations = db.createObjectStore('cachedRecommendations', { keyPath: 'id' });
    recommendations.createIndex('byType', 'type');
    recommendations.createIndex('byGeneratedAt', 'generatedAt');

    // --- App-level key/value (schema version, scan cursors, settings) ---
    db.createObjectStore('meta', { keyPath: 'key' });
  }
}
