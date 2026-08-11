import { getAlbumMetaCache, putAlbumMetaCache } from "../db/albumMetaRepo.js";
import { findMusicBrainzReleaseMeta } from "./providers/musicbrainzReleaseProvider.js";

const FAILURE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const inFlightRequests = new Map();

function isCacheFresh(entry) {
  if (!entry) return false;

  if (entry.failed) {
    return Date.now() < (entry.retryAfter ?? 0);
  }

  return true;
}

/**
 * Resolves and caches Album-view enrichment:
 * release date, country, status, and track count.
 *
 * Album artwork itself is handled separately by artworkManager.js.
 */
export function resolveAlbumMeta({ id, name, artistName }) {
  if (!id) {
    return Promise.resolve(null);
  }

  const inFlight = inFlightRequests.get(id);

  if (inFlight) {
    return inFlight;
  }

  const promise = runPipeline({
    id,
    name,
    artistName,
  }).finally(() => {
    inFlightRequests.delete(id);
  });

  inFlightRequests.set(id, promise);

  return promise;
}

async function runPipeline({ id, name, artistName }) {
  const cached = await getAlbumMetaCache(id);

  if (isCacheFresh(cached)) {
    return cached.failed ? null : cached;
  }

  let found = null;

  try {
    found = await findMusicBrainzReleaseMeta({
      artist: artistName,
      album: name,
    });
  } catch (err) {
    console.warn(
      "[motif/album] MusicBrainz release lookup threw:",
      err.message,
    );
  }

  if (!found) {
    await putAlbumMetaCache({
      key: id,
      failed: true,
      cachedAt: Date.now(),
      retryAfter: Date.now() + FAILURE_COOLDOWN_MS,
    });

    return null;
  }

  const entry = {
    key: id,
    ...found,
    cachedAt: Date.now(),
    failed: false,
    retryAfter: null,
  };

  await putAlbumMetaCache(entry);

  return entry;
}
