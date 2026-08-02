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
import { notifyLibraryChanged } from "../state/libraryBus.js";

const FAILURE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

const ONLINE_PROVIDERS = [
  findMusicBrainzArtwork,
  findDeezerArtwork,
  findDiscogsArtwork,
];

const inFlightRequests = new Map();
const notifiedFailures = new Set();

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

async function backfillAlbum(albumId, artworkId) {
  if (!albumId || !artworkId) return;
  try {
    await applyArtworkToAlbum(albumId, artworkId);
    notifyLibraryChanged(); // so Library/Home refresh and pick up the resolved artwork via the fast artworkId path
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
    return cacheFailure(albumKey, artist, album);
  }

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

function notifyFailure(albumKey, album) {
  if (notifiedFailures.has(albumKey)) return;
  notifiedFailures.add(albumKey);
  pushToast(
    album
      ? `No artwork available for "${album}"`
      : "Album artwork could not be loaded",
    { type: "info" },
  );
}
