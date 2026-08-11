const MB_BASE = "https://musicbrainz.org/ws/2";

/**
 * MusicBrainz supplies structured artist metadata only.
 *
 * MusicBrainz does not provide artist photos through this endpoint.
 * The MBID is particularly important because it lets downstream
 * providers such as Last.fm identify the artist more reliably.
 */
export async function findMusicBrainzArtistMeta({ name }) {
  if (!name) return null;

  try {
    const params = new URLSearchParams({
      query: `artist:"${name}"`,
      fmt: "json",
      limit: "5",
    });

    const res = await fetch(`${MB_BASE}/artist/?${params.toString()}`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) return null;

    const data = await res.json();

    const artists = Array.isArray(data.artists) ? data.artists : [];

    const normalizedName = name.trim().toLowerCase();

    /*
     * Prefer an exact name match over blindly taking the first
     * MusicBrainz search result. The first result is not guaranteed
     * to be the artist we actually want.
     */
    const exactMatch =
      artists.find(
        (artist) => artist.name?.trim().toLowerCase() === normalizedName,
      ) || artists[0];

    if (!exactMatch) return null;

    const tags = (exactMatch.tags || [])
      .slice()
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .map((tag) => tag.name)
      .filter(Boolean);

    return {
      mbid: exactMatch.id,
      tags,
      country: exactMatch.country || null,
      disambiguation: exactMatch.disambiguation || null,
    };
  } catch (err) {
    console.warn(
      "[motif/artist] MusicBrainz artist lookup failed:",
      err.message,
    );

    return null;
  }
}
