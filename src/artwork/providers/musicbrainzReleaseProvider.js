const MB_BASE = "https://musicbrainz.org/ws/2";

/**
 * Supplementary release information for the Album view.
 *
 * Album artwork itself is handled separately by musicbrainzProvider.js
 * and Cover Art Archive.
 */
export async function findMusicBrainzReleaseMeta({ artist, album }) {
  if (!artist || !album) return null;

  try {
    const query = `release:"${album}" AND artist:"${artist}"`;

    const params = new URLSearchParams({
      query,
      fmt: "json",
      limit: "5",
    });

    const res = await fetch(`${MB_BASE}/release/?${params.toString()}`, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) return null;

    const data = await res.json();

    const match = data.releases?.[0];

    if (!match) return null;

    return {
      mbid: match.id,
      date: match.date || null,
      country: match.country || null,
      status: match.status || null,
      trackCount: match["track-count"] ?? null,
    };
  } catch (err) {
    console.warn(
      "[motif/album] MusicBrainz release lookup failed:",
      err.message,
    );

    return null;
  }
}
