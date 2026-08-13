// src/artwork/embeddedArtwork.js — full updated file (parseBlob-based extractor/resolver removed; only the dedup-key helper remains)
function normalizeKeyPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Generates a scan-scoped key for embedded artwork deduplication.
 *
 * Tracks from the same album normally share the same embedded cover, so
 * hashing (see createArtworkHashCache in db/artworkRepo.js) only needs to
 * happen once per album — keyed by this — rather than once per track.
 *
 * Note: this file used to also own the actual artwork *extraction*
 * (a second, separate parseBlob() pass over the file, gated to one track
 * per album). That's gone — metadataWorker.js now extracts embedded
 * artwork as part of the same parse it already does for title/artist/
 * album/etc, so there's no second read or second parse left to
 * coordinate here. This key is only used to memoize the SHA-256 hashing
 * step, which still benefits from being done once per album rather than
 * once per track.
 */
export function makeEmbeddedArtworkKey({ artist, albumArtist, album, year }) {
  const normalizedArtist = normalizeKeyPart(albumArtist || artist);

  const normalizedAlbum = normalizeKeyPart(album);

  const normalizedYear = year ? String(year) : "";

  if (!normalizedArtist || !normalizedAlbum) {
    return null;
  }

  return `${normalizedArtist}|${normalizedAlbum}|${normalizedYear}`;
}
