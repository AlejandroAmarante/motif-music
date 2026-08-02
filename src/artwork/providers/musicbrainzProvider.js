const MB_BASE = "https://musicbrainz.org/ws/2";
const CAA_BASE = "https://coverartarchive.org";

async function resolveMbid({ artist, album }) {
  const query = `release:"${album}" AND artist:"${artist}"`;
  const params = new URLSearchParams({ query, fmt: "json", limit: "5" });
  const res = await fetch(`${MB_BASE}/release/?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.releases?.[0]?.id ?? null;
}

async function fetchFrontCover(mbid) {
  const res = await fetch(`${CAA_BASE}/release/${mbid}/front`);
  if (!res.ok) return null;
  const mimeType = res.headers.get("content-type") || "image/jpeg";
  const buffer = await res.arrayBuffer();
  return { bytes: new Uint8Array(buffer), mimeType };
}

/**
 * MusicBrainz's own etiquette also asks for a descriptive User-Agent, but
 * (same as LRCLIB) browsers won't let JS set that header — and unlike
 * LRCLIB, MusicBrainz doesn't document a browser-safe fallback header. This
 * is a known, accepted limitation of running this entirely client-side; we
 * still send a proper Accept header and behave as a good citizen otherwise
 * (one request per album, fully deduped and cached by the manager).
 */
export async function findMusicBrainzArtwork({ artist, album }) {
  if (!artist || !album) return null;
  const mbid = await resolveMbid({ artist, album });
  if (!mbid) return null;
  const cover = await fetchFrontCover(mbid);
  if (!cover) return null;
  return {
    provider: "coverartarchive",
    mbid,
    blob: cover.bytes,
    mimeType: cover.mimeType,
  };
}
