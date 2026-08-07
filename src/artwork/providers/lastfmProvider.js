// src/artwork/providers/lastfmProvider.js — NEW
const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, "").trim();
}

/**
 * Last.fm's artist.getinfo is the only free source Motif uses that reliably
 * returns an artist *photo* (MusicBrainz and Cover Art Archive don't have
 * one). It requires a personal API key, so this is entirely opt-in — see
 * `lastfmApiKey` in Settings — and is a silent no-op without one, same
 * pattern as the Discogs artwork provider.
 */
export async function findLastfmArtistMeta({ name, apiKey }) {
  if (!name || !apiKey) return null;
  try {
    const params = new URLSearchParams({
      method: "artist.getinfo",
      artist: name,
      api_key: apiKey,
      format: "json",
    });
    const res = await fetch(`${LASTFM_BASE}?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const artist = data.artist;
    if (!artist) return null;

    const images = Array.isArray(artist.image) ? artist.image : [];
    const preferred =
      images.find((img) => img.size === "extralarge" || img.size === "mega") ||
      images[images.length - 1];
    const imageUrl = preferred?.["#text"]?.trim() || null;

    const tags = Array.isArray(artist.tags?.tag)
      ? artist.tags.tag.map((t) => t.name).filter(Boolean)
      : [];

    const bio = artist.bio?.summary ? stripHtml(artist.bio.summary) : null;

    return {
      imageUrl: imageUrl || null,
      tags,
      bio,
      mbid: artist.mbid || null,
    };
  } catch (err) {
    console.warn("[motif/artist] Last.fm lookup failed:", err.message);
    return null;
  }
}
