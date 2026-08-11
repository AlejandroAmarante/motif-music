import {
  getArtistMetaCache,
  putArtistMetaCache,
  clearArtistMetaCacheEntry,
} from "../db/artistMetaRepo.js";
import { getAlbumsByArtistId } from "../db/albumsRepo.js";
import { getSetting } from "../db/settingsRepo.js";
import { findMusicBrainzArtistMeta } from "./providers/musicbrainzArtistProvider.js";
import { findLastfmArtistMeta } from "./providers/lastfmProvider.js";
import { findDeezerArtistMeta } from "./providers/deezerArtistProvider.js";

const FAILURE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const ARTIST_META_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

const LASTFM_PLACEHOLDER_HASH = "2a96cbd8b46e442fc41c2b86b821562f.png";

const inFlightRequests = new Map();

function isKnownInvalidImage(imageUrl) {
  if (!imageUrl) return false;

  return imageUrl.includes(LASTFM_PLACEHOLDER_HASH);
}

function isCacheFresh(entry) {
  if (!entry) return false;

  /*
   * A cache entry containing the old Last.fm generic image is
   * deliberately treated as stale. This automatically repairs
   * existing cached entries created before the provider fix.
   */
  if (isKnownInvalidImage(entry.imageUrl)) {
    return false;
  }

  if (entry.failed) {
    return Date.now() < (entry.retryAfter ?? 0);
  }

  return Date.now() - (entry.cachedAt ?? 0) < ARTIST_META_CACHE_MS;
}

/**
 * Resolves and caches Artist-view enrichment.
 *
 * Image priority:
 *   1. Deezer
 *   2. Local album artwork
 *
 * Last.fm is used only for artist information such as:
 *   - biography
 *   - tags
 *   - MBID
 *
 * MusicBrainz supplies the MBID and structured metadata.
 */
export function resolveArtistMeta(artist) {
  if (!artist?.id) {
    return Promise.resolve(null);
  }

  const inFlight = inFlightRequests.get(artist.id);

  if (inFlight) {
    return inFlight;
  }

  const promise = runPipeline(artist).finally(() => {
    inFlightRequests.delete(artist.id);
  });

  inFlightRequests.set(artist.id, promise);

  return promise;
}

async function runPipeline(artist) {
  const cached = await getArtistMetaCache(artist.id);

  if (isCacheFresh(cached)) {
    return cached.failed ? null : cached;
  }

  /*
   * Remove a known-invalid cached entry immediately.
   *
   * This prevents the old Last.fm placeholder from surviving
   * even if the cache entry would otherwise still be within TTL.
   */
  if (cached && isKnownInvalidImage(cached.imageUrl)) {
    try {
      await clearArtistMetaCacheEntry(artist.id);
    } catch (err) {
      console.warn(
        "[motif/artist] failed to clear stale artist metadata:",
        err.message,
      );
    }
  }

  let mb = null;

  try {
    mb = await findMusicBrainzArtistMeta({
      name: artist.name,
    });
  } catch (err) {
    console.warn("[motif/artist] MusicBrainz lookup threw:", err.message);
  }

  /*
   * Deezer is the primary source for artist images.
   */
  let deezer = null;

  try {
    deezer = await findDeezerArtistMeta({
      name: artist.name,
    });
  } catch (err) {
    console.warn("[motif/artist] Deezer lookup threw:", err.message);
  }

  let imageUrl = deezer?.imageUrl || null;
  let imageProvider = imageUrl ? "deezer" : null;

  /*
   * Last.fm is used only for artist information.
   *
   * The returned imageUrl is intentionally ignored.
   */
  const lastfmKey = await getSetting("lastfmApiKey", null);

  let lastfm = null;

  if (lastfmKey) {
    try {
      lastfm = await findLastfmArtistMeta({
        name: artist.name,
        mbid: mb?.mbid || null,
        apiKey: lastfmKey,
      });
    } catch (err) {
      console.warn("[motif/artist] Last.fm lookup threw:", err.message);
    }
  }

  /*
   * Finally fall back to one of the artist's local album covers.
   *
   * The selected artwork ID is persisted, so the fallback does not
   * randomly change each time the Artist view is opened.
   */
  let fallbackArtworkId = null;

  if (!imageUrl) {
    const albums = await getAlbumsByArtistId(artist.id);
    const withArt = albums.filter((album) => album.artworkId);

    if (withArt.length) {
      const pick = withArt[Math.floor(Math.random() * withArt.length)];

      fallbackArtworkId = pick.artworkId;
      imageProvider = "local";
    }
  }

  const tags = [
    ...new Set([...(mb?.tags || []), ...(lastfm?.tags || [])]),
  ].slice(0, 6);

  const bio = lastfm?.bio || null;

  const mbid = mb?.mbid || lastfm?.mbid || null;

  if (!imageUrl && !fallbackArtworkId && !tags.length && !bio && !mb) {
    await putArtistMetaCache({
      key: artist.id,
      failed: true,
      cachedAt: Date.now(),
      failedAt: Date.now(),
      retryAfter: Date.now() + FAILURE_COOLDOWN_MS,
    });

    return null;
  }

  const entry = {
    key: artist.id,
    imageUrl,
    fallbackArtworkId,
    imageProvider,
    tags,
    bio,
    mbid,
    cachedAt: Date.now(),
    failed: false,
    retryAfter: null,
  };

  await putArtistMetaCache(entry);

  return entry;
}
