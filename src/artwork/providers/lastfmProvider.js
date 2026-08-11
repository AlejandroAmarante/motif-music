const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, "").trim();
}

/**
 * Last.fm artist metadata.
 *
 * Last.fm is intentionally NOT used for artist artwork.
 *
 * This provider supplies:
 * - biography
 * - tags
 * - MBID
 *
 * Artist images are handled separately by the Deezer provider.
 *
 * When a MusicBrainz ID is available, it is preferred over
 * artist-name matching because it provides a more reliable
 * artist identity.
 */
export async function findLastfmArtistMeta({ name, mbid = null, apiKey }) {
  if ((!name && !mbid) || !apiKey) return null;

  try {
    const params = new URLSearchParams({
      method: "artist.getinfo",
      api_key: apiKey,
      format: "json",
      autocorrect: "1",
    });

    if (mbid) {
      params.set("mbid", mbid);
    } else {
      params.set("artist", name);
    }

    const res = await fetch(`${LASTFM_BASE}?${params.toString()}`);

    if (!res.ok) {
      console.warn(`[motif/artist] Last.fm returned HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();

    if (data.error) {
      console.warn(
        `[motif/artist] Last.fm error ${data.error}: ${data.message}`,
      );
      return null;
    }

    const artist = data.artist;

    if (!artist) return null;

    const tags = Array.isArray(artist.tags?.tag)
      ? artist.tags.tag.map((tag) => tag.name).filter(Boolean)
      : [];

    const bio = artist.bio?.summary ? stripHtml(artist.bio.summary) : null;

    return {
      tags,
      bio,
      mbid: artist.mbid || mbid || null,
    };
  } catch (err) {
    console.warn("[motif/artist] Last.fm lookup failed:", err.message);
    return null;
  }
}
