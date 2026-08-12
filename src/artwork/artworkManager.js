import {
  storeArtwork,
  getAlbumArtworkCache,
  putAlbumArtworkCache,
} from "../db/artworkRepo.js";
import { applyArtworkToAlbum } from "../db/songsRepo.js";
import { findMusicBrainzArtwork } from "./providers/musicbrainzProvider.js";
import { findDeezerArtwork } from "./providers/deezerProvider.js";
import { findDiscogsArtwork } from "./providers/discogsProvider.js";
import { pushToast } from "../state/toastBus.js";
import { isScanActive } from "../library/scanState.js";

const FAILURE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const ONLINE_PROVIDERS = [
  findMusicBrainzArtwork,
  findDeezerArtwork,
  findDiscogsArtwork,
];

const inFlightRequests = new Map();

const notifiedFailures = new Set();
const notifiedSearching = new Set();
const notifiedLoaded = new Set();

/**
 * Caps simultaneous online album-art requests.
 */
function createConcurrencyGate(limit) {
  let active = 0;

  const queue = [];

  function runNext() {
    if (active >= limit || queue.length === 0) {
      return;
    }

    active += 1;

    const { task, resolve, reject } = queue.shift();

    Promise.resolve()
      .then(task)
      .then(
        (result) => {
          active -= 1;
          resolve(result);
          runNext();
        },
        (err) => {
          active -= 1;
          reject(err);
          runNext();
        },
      );
  }

  return function gate(task) {
    return new Promise((resolve, reject) => {
      queue.push({
        task,
        resolve,
        reject,
      });

      runNext();
    });
  };
}

const artworkGate = createConcurrencyGate(2);

function isCacheFresh(entry) {
  if (!entry) {
    return false;
  }

  if (entry.failed) {
    return Date.now() < (entry.retryAfter ?? 0);
  }

  return true;
}

export function albumArtworkContext(song) {
  if (!song) {
    return null;
  }

  const albumKey = song.albumId || (song.id ? `song:${song.id}` : null);

  return {
    albumKey,
    albumId: song.albumId || null,
    artist: song.albumArtist || song.artist || null,
    album: song.album || null,
    existingArtworkId: song.artworkId || null,
  };
}

export function resolveAlbumArtwork(ctx) {
  if (!ctx) {
    return Promise.resolve(null);
  }

  const { albumKey, existingArtworkId } = ctx;

  if (existingArtworkId) {
    return Promise.resolve({
      artworkId: existingArtworkId,
    });
  }

  if (!albumKey) {
    return Promise.resolve(null);
  }

  const inFlight = inFlightRequests.get(albumKey);

  if (inFlight) {
    return inFlight;
  }

  const promise = runPipeline(ctx).finally(() => {
    inFlightRequests.delete(albumKey);
  });

  inFlightRequests.set(albumKey, promise);

  return promise;
}

export function prefetchAlbumArtwork(ctx) {
  if (!ctx?.albumKey) {
    return;
  }

  resolveAlbumArtwork(ctx).catch(() => {});
}

/**
 * Registers artwork extracted directly from a local music file.
 *
 * Embedded artwork is treated as the preferred local source because it belongs
 * to the actual file/release. Existing non-failed artwork remains untouched,
 * preventing a later scan from replacing an already-resolved online image.
 */
export async function registerEmbeddedArtwork({
  albumId,
  artist,
  album,
  artworkId,
}) {
  if (!albumId || !artworkId) {
    return null;
  }

  const albumKey = albumId;

  try {
    const existing = await getAlbumArtworkCache(albumKey);

    /*
     * A previously resolved artwork source wins over a new embedded
     * extraction. This is important if a user already has a cached online
     * image or if artwork was manually resolved before the scan completed.
     *
     * A failure entry does NOT block embedded artwork.
     */
    if (
      existing &&
      !existing.failed &&
      (existing.artworkId || existing.artworkUrl)
    ) {
      if (existing.artworkId && albumId) {
        await backfillAlbum(albumId, existing.artworkId);
      }

      return existing.artworkId
        ? {
            artworkId: existing.artworkId,
          }
        : {
            artworkUrl: existing.artworkUrl,
          };
    }

    const entry = {
      key: albumKey,
      artist: artist ?? null,
      album: album ?? null,
      mbid: null,
      provider: "embedded",
      artworkId,
      artworkUrl: null,
      cachedAt: Date.now(),
      failed: false,
      failedAt: null,
      retryAfter: null,
    };

    await putAlbumArtworkCache(entry);

    await backfillAlbum(albumId, artworkId);

    return {
      artworkId,
    };
  } catch (err) {
    console.warn(
      "[motif/artwork] failed to register embedded artwork:",
      err?.message || err,
    );

    return null;
  }
}

/**
 * Persists the resolved artworkId onto the album and its songs.
 */
async function backfillAlbum(albumId, artworkId) {
  if (!albumId || !artworkId) {
    return;
  }

  try {
    await applyArtworkToAlbum(albumId, artworkId);
  } catch (err) {
    console.warn(
      "[motif/artwork] failed to backfill album:",
      err?.message || err,
    );
  }
}

async function runPipeline(ctx) {
  const { albumKey, albumId, artist, album } = ctx;

  const cached = await getAlbumArtworkCache(albumKey);

  if (isCacheFresh(cached)) {
    if (cached.failed) {
      return null;
    }

    if (albumId && cached.artworkId) {
      backfillAlbum(albumId, cached.artworkId);
    }

    if (cached.artworkId) {
      return {
        artworkId: cached.artworkId,
      };
    }

    return cached.artworkUrl
      ? {
          artworkUrl: cached.artworkUrl,
        }
      : null;
  }

  if (!artist || !album) {
    return null;
  }

  return artworkGate(() => runProviders(ctx));
}

async function runProviders(ctx) {
  const { albumKey, albumId, artist, album } = ctx;

  notifySearching(albumKey, album);

  for (const provider of ONLINE_PROVIDERS) {
    let found;

    try {
      found = await provider({
        artist,
        album,
      });
    } catch (err) {
      console.warn(
        "[motif/artwork] provider threw, skipping:",
        err?.message || err,
      );

      found = null;
    }

    if (!found) {
      continue;
    }

    /*
     * Embedded artwork may have been extracted while the network provider
     * was running. Re-check the cache before allowing this online result
     * to overwrite it.
     */
    const latestCache = await getAlbumArtworkCache(albumKey);

    if (latestCache && !latestCache.failed && latestCache.artworkId) {
      if (albumId) {
        backfillAlbum(albumId, latestCache.artworkId);
      }

      return {
        artworkId: latestCache.artworkId,
      };
    }

    let artworkId = null;

    if (found.blob) {
      try {
        artworkId = await storeArtwork(found.blob, found.mimeType);
      } catch (err) {
        console.warn(
          "[motif/artwork] failed to persist downloaded artwork:",
          err?.message || err,
        );
      }
    }

    if (!artworkId && !found.artworkUrl) {
      continue;
    }

    const entry = {
      key: albumKey,
      artist,
      album,
      mbid: found.mbid ?? null,
      provider: found.provider,
      artworkId,
      artworkUrl: artworkId ? null : (found.artworkUrl ?? null),
      cachedAt: Date.now(),
      failed: false,
      failedAt: null,
      retryAfter: null,
    };

    await putAlbumArtworkCache(entry);

    if (albumId && artworkId) {
      backfillAlbum(albumId, artworkId);
    }

    notifyLoaded(albumKey, album);

    return artworkId
      ? {
          artworkId,
        }
      : {
          artworkUrl: entry.artworkUrl,
        };
  }

  return cacheFailure(albumKey, artist, album);
}

async function cacheFailure(albumKey, artist, album) {
  await putAlbumArtworkCache({
    key: albumKey,
    artist: artist ?? null,
    album: album ?? null,
    mbid: null,
    provider: null,
    artworkId: null,
    artworkUrl: null,
    cachedAt: Date.now(),
    failed: true,
    failedAt: Date.now(),
    retryAfter: Date.now() + FAILURE_COOLDOWN_MS,
  });

  notifyFailure(albumKey, album);

  return null;
}

/*
 * Each notification function remembers that the user has already been told
 * about an album, even while a scan suppresses visible toasts.
 */

function notifyFailure(albumKey, album) {
  if (notifiedFailures.has(albumKey)) {
    return;
  }

  notifiedFailures.add(albumKey);

  if (isScanActive()) {
    return;
  }

  pushToast(
    album
      ? `No artwork available for "${album}"`
      : "Album artwork could not be loaded",
    {
      type: "info",
    },
  );
}

function notifySearching(albumKey, album) {
  if (notifiedSearching.has(albumKey)) {
    return;
  }

  notifiedSearching.add(albumKey);

  if (isScanActive()) {
    return;
  }

  pushToast(
    album
      ? `Searching for artwork for "${album}"…`
      : "Searching for album artwork…",
    {
      type: "info",
      duration: 2200,
    },
  );
}

function notifyLoaded(albumKey, album) {
  if (notifiedLoaded.has(albumKey)) {
    return;
  }

  notifiedLoaded.add(albumKey);

  if (isScanActive()) {
    return;
  }

  pushToast(album ? `Artwork loaded for "${album}"` : "Album artwork loaded", {
    type: "success",
  });
}
