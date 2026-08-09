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

const FAILURE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

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
 * Caps how many *different* albums can be resolving artwork over the
 * network at once, app-wide. resolveAlbumArtwork()'s inFlightRequests
 * below already dedupes repeat calls for the *same* album, but does
 * nothing to stop many different albums from all firing at once — which
 * is exactly what happens during a big library scan, where dozens of
 * newly-enriched songs (each a different, never-before-seen album) can
 * turn up within the same second. This queues the rest rather than
 * firing them all immediately, so Motif stays a reasonably polite client
 * of MusicBrainz/Deezer/Discogs regardless of how fast songs are being
 * discovered. 2 is deliberately conservative — each album's own lookup
 * is already sequential across providers (MusicBrainz, then Deezer, then
 * Discogs, trying the next only if the last found nothing), so this
 * bounds Motif to at most 2 outbound artwork requests in flight at once.
 */
function createConcurrencyGate(limit) {
  let active = 0;
  const queue = [];

  function runNext() {
    if (active >= limit || queue.length === 0) return;
    active += 1;
    const { task, resolve, reject } = queue.shift();
    task().then(
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
      queue.push({ task, resolve, reject });
      runNext();
    });
  };
}

const artworkGate = createConcurrencyGate(2);

function isCacheFresh(entry) {
  if (!entry) return false;
  if (entry.failed) return Date.now() < (entry.retryAfter ?? 0);
  return true;
}

export function albumArtworkContext(song) {
  if (!song) return null;
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
  if (!ctx) return Promise.resolve(null);
  const { albumKey, existingArtworkId } = ctx;

  if (existingArtworkId) {
    return Promise.resolve({ artworkId: existingArtworkId });
  }
  if (!albumKey) return Promise.resolve(null);

  const inFlight = inFlightRequests.get(albumKey);
  if (inFlight) return inFlight;

  const promise = runPipeline(ctx).finally(() => {
    inFlightRequests.delete(albumKey);
  });
  inFlightRequests.set(albumKey, promise);
  return promise;
}

export function prefetchAlbumArtwork(ctx) {
  if (!ctx?.albumKey) return;
  resolveAlbumArtwork(ctx).catch(() => {});
}

/**
 * Persists the resolved artworkId onto the album + its songs so a *future*
 * fresh load skips the pipeline entirely. Deliberately does NOT broadcast
 * any kind of "reload everything" signal — every live Artwork instance for
 * this album already gets the result directly through its own call to
 * resolveAlbumArtwork() above (same in-flight promise or a fresh cache
 * hit).
 */
async function backfillAlbum(albumId, artworkId) {
  if (!albumId || !artworkId) return;
  try {
    await applyArtworkToAlbum(albumId, artworkId);
  } catch (err) {
    console.warn("[motif/artwork] failed to backfill album:", err.message);
  }
}

async function runPipeline(ctx) {
  const { albumKey, albumId, artist, album } = ctx;

  const cached = await getAlbumArtworkCache(albumKey);
  if (isCacheFresh(cached)) {
    if (cached.failed) return null;
    if (albumId && cached.artworkId) backfillAlbum(albumId, cached.artworkId);
    return cached.artworkId
      ? { artworkId: cached.artworkId }
      : { artworkUrl: cached.artworkUrl };
  }

  if (!artist || !album) {
    // Nothing to search with — this isn't a failed lookup, there's simply
    // no query to run (a loose single with no album tag, most commonly).
    // No network call, no cache write, no toast. Re-checking this on
    // every mount costs nothing, since it never gets past this string
    // check to touch the network either way.
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
      found = await provider({ artist, album });
    } catch (err) {
      console.warn("[motif/artwork] provider threw, skipping:", err.message);
      found = null;
    }
    if (!found) continue;

    let artworkId = null;
    if (found.blob) {
      try {
        artworkId = await storeArtwork(found.blob, found.mimeType);
      } catch (err) {
        console.warn(
          "[motif/artwork] failed to persist downloaded artwork:",
          err.message,
        );
      }
    }
    if (!artworkId && !found.artworkUrl) continue;

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
    if (albumId && artworkId) backfillAlbum(albumId, artworkId);
    notifyLoaded(albumKey, album);
    return artworkId ? { artworkId } : { artworkUrl: entry.artworkUrl };
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

// Each notify* function still records "already told the user about this
// album" even while a scan suppresses the toast itself — so once the scan
// ends, an album that quietly resolved (or quietly failed) during it
// doesn't then surface a toast the first time something re-renders it.
// The dedup bookkeeping and the visible notification are deliberately two
// separate steps for exactly that reason.

function notifyFailure(albumKey, album) {
  if (notifiedFailures.has(albumKey)) return;
  notifiedFailures.add(albumKey);
  if (isScanActive()) return;
  pushToast(
    album
      ? `No artwork available for "${album}"`
      : "Album artwork could not be loaded",
    { type: "info" },
  );
}

function notifySearching(albumKey, album) {
  if (notifiedSearching.has(albumKey)) return;
  notifiedSearching.add(albumKey);
  if (isScanActive()) return;
  pushToast(
    album
      ? `Searching for artwork for "${album}"…`
      : "Searching for album artwork…",
    { type: "info", duration: 2200 },
  );
}

function notifyLoaded(albumKey, album) {
  if (notifiedLoaded.has(albumKey)) return;
  notifiedLoaded.add(albumKey);
  if (isScanActive()) return;
  pushToast(album ? `Artwork loaded for "${album}"` : "Album artwork loaded", {
    type: "success",
  });
}
