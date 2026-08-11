import { getSetting } from "../../db/settingsRepo.js";

const DISCOGS_SEARCH = "https://api.discogs.com/database/search";

/**
 * Discogs' unauthenticated rate limit is too low to serve as a real
 * fallback, so this only runs if the user has supplied their own
 * personal access token in Settings.
 *
 * Without a token this is a silent no-op.
 */
export async function findDiscogsArtwork({ artist, album }) {
  if (!artist || !album) return null;

  const token = await getSetting("discogsToken", null);

  if (!token) return null;

  try {
    const params = new URLSearchParams({
      artist,
      release_title: album,
      type: "release",
      token,
    });

    const res = await fetch(`${DISCOGS_SEARCH}?${params.toString()}`);

    if (!res.ok) return null;

    const data = await res.json();

    const match = data.results?.[0];

    if (!match?.cover_image) return null;

    return {
      provider: "discogs",
      mbid: null,
      artworkUrl: match.cover_image,
    };
  } catch (err) {
    console.warn("[motif/artwork] Discogs lookup failed:", err.message);

    return null;
  }
}
