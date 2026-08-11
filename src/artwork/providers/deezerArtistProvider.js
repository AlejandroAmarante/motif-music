const DEEZER_ARTIST_SEARCH = "https://api.deezer.com/search/artist";

/**
 * Deezer is used as a secondary artist-image provider.
 *
 * Deezer's API may reject browser requests because of CORS depending on
 * the user's environment. That is intentionally treated as a normal
 * provider miss so the pipeline can continue to local artwork.
 */
export async function findDeezerArtistMeta({ name }) {
  if (!name) return null;

  try {
    const params = new URLSearchParams({
      q: `artist:"${name}"`,
    });

    const res = await fetch(`${DEEZER_ARTIST_SEARCH}?${params.toString()}`);

    if (!res.ok) return null;

    const data = await res.json();

    const match = data.data?.[0];

    if (!match) return null;

    const imageUrl =
      match.picture_xl ||
      match.picture_big ||
      match.picture_medium ||
      match.picture ||
      null;

    if (!imageUrl) return null;

    return {
      imageUrl,
      deezerId: match.id ?? null,
      name: match.name ?? null,
    };
  } catch (err) {
    console.warn(
      "[motif/artist] Deezer artist lookup failed (likely CORS from a client-only app):",
      err.message,
    );

    return null;
  }
}
