const DEEZER_SEARCH = "https://api.deezer.com/search/album";

/**
 * Deezer's public API historically hasn't sent permissive CORS headers for
 * browser fetch() calls from a pure client-side app with no backend proxy —
 * this may simply fail with a network/CORS error, which is fine: it just
 * means this stage is skipped and the pipeline falls through to Discogs,
 * same as any other "not found" result. Resolves to a hosted image URL
 * rather than downloading bytes, since Deezer's CDN images are generally
 * fine to reference directly via <img src> even when a fetch() to the same
 * URL would be blocked by CORS.
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
    return { provider: "deezer", mbid: null, artworkUrl: url };
  } catch (err) {
    console.warn(
      "[motif/artwork] Deezer lookup failed (likely CORS from a client-only app):",
      err.message,
    );
    return null;
  }
}
