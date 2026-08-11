const DEEZER_SEARCH = "https://api.deezer.com/search/album";

/**
 * Deezer's public API historically hasn't sent permissive CORS headers
 * for browser fetch() calls from a pure client-side app with no backend
 * proxy.
 *
 * If the request is blocked, this provider simply returns null and the
 * artwork pipeline continues to the next provider.
 */
export async function findDeezerArtwork({ artist, album }) {
  if (!artist || !album) return null;

  try {
    const params = new URLSearchParams({
      q: `artist:"${artist}" album:"${album}"`,
    });

    const res = await fetch(`${DEEZER_SEARCH}?${params.toString()}`);

    if (!res.ok) return null;

    const data = await res.json();

    const match = data.data?.[0];

    const url = match?.cover_xl || match?.cover_big || match?.cover_medium;

    if (!url) return null;

    return {
      provider: "deezer",
      mbid: null,
      artworkUrl: url,
    };
  } catch (err) {
    console.warn(
      "[motif/artwork] Deezer lookup failed (likely CORS from a client-only app):",
      err.message,
    );

    return null;
  }
}
