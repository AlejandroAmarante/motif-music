// src/artwork/artistMetaManager.js — NEW
import {
  getArtistMetaCache,
  putArtistMetaCache,
} from "../db/artistMetaRepo.js";
import { getAlbumsByArtistId } from "../db/albumsRepo.js";
import { getSetting } from "../db/settingsRepo.js";
import { findMusicBrainzArtistMeta } from "./providers/musicbrainzArtistProvider.js";
import { findLastfmArtistMeta } from "./providers/lastfmProvider.js";

const FAILURE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h, matches album artwork's cooldown

const inFlightRequests = new Map();

function isCacheFresh(entry) {
  if (!entry) return false;
  if (entry.failed) return Date.now() < (entry.retryAfter ?? 0);
  return true;
}

/**
 * Resolves (and caches) Artist-view enrichment: a photo where one can be
 * found, a handful of genre tags, and a bio snippet. MusicBrainz supplies
 * structured data (tags, mbid) with no key required; Last.fm is the only
 * source that reliably has a *photo*, and is opt-in via a user-supplied API
 * key (see Settings). Without one — or if Last.fm has nothing — this falls
 * back to a photo borrowed from one of the artist's own local album covers
 * rather than leaving the hero empty.
 */
export function resolveArtistMeta(artist) {
  if (!artist?.id) return Promise.resolve(null);

  const inFlight = inFlightRequests.get(artist.id);
  if (inFlight) return inFlight;

  const promise = runPipeline(artist).finally(() => {
    inFlightRequests.delete(artist.id);
  });
  inFlightRequests.set(artist.id, promise);
  return promise;
}

async function runPipeline(artist) {
  const cached = await getArtistMetaCache(artist.id);
  if (isCacheFresh(cached)) return cached.failed ? null : cached;

  let mb = null;
  try {
    mb = await findMusicBrainzArtistMeta({ name: artist.name });
  } catch (err) {
    console.warn("[motif/artist] MusicBrainz lookup threw:", err.message);
  }

  const lastfmKey = await getSetting("lastfmApiKey", null);
  let lastfm = null;
  if (lastfmKey) {
    try {
      lastfm = await findLastfmArtistMeta({
        name: artist.name,
        apiKey: lastfmKey,
      });
    } catch (err) {
      console.warn("[motif/artist] Last.fm lookup threw:", err.message);
    }
  }

  const imageUrl = lastfm?.imageUrl || null;

  // No remote photo — pick a random one of the artist's own album covers
  // instead. Picked once and cached rather than re-rolled on every visit,
  // so the hero photo doesn't flicker between covers each time the page
  // is opened.
  let fallbackArtworkId = null;
  if (!imageUrl) {
    const albums = await getAlbumsByArtistId(artist.id);
    const withArt = albums.filter((a) => a.artworkId);
    if (withArt.length) {
      const pick = withArt[Math.floor(Math.random() * withArt.length)];
      fallbackArtworkId = pick.artworkId;
    }
  }

  const tags = [
    ...new Set([...(mb?.tags || []), ...(lastfm?.tags || [])]),
  ].slice(0, 6);

  if (!imageUrl && !fallbackArtworkId && !tags.length && !mb) {
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
    tags,
    bio: lastfm?.bio || null,
    mbid: mb?.mbid || lastfm?.mbid || null,
    cachedAt: Date.now(),
    failed: false,
    retryAfter: null,
  };
  await putArtistMetaCache(entry);
  return entry;
}
