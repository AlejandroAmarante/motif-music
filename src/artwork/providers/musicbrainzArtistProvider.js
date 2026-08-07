// src/artwork/providers/musicbrainzArtistProvider.js — NEW
const MB_BASE = "https://musicbrainz.org/ws/2";

/**
 * MusicBrainz has no artist-photo endpoint of its own — this is used for
 * structured metadata only (mbid, genre tags, disambiguation) and never for
 * imagery. Same no-auth, no-User-Agent-header limitation noted in
 * musicbrainzProvider.js applies here.
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
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const match = data.artists?.[0];
    if (!match) return null;

    const tags = (match.tags || [])
      .slice()
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .map((t) => t.name);

    return {
      mbid: match.id,
      tags,
      country: match.country || null,
      disambiguation: match.disambiguation || null,
    };
  } catch (err) {
    console.warn(
      "[motif/artist] MusicBrainz artist lookup failed:",
      err.message,
    );
    return null;
  }
}
