import { parseBlob } from "music-metadata";
import { extractEmbeddedLyrics } from "./lyrics.js";

function createEmptyMetadata() {
  return {
    title: null,
    artist: null,
    album: null,
    albumArtist: null,
    trackNumber: null,
    discNumber: null,
    genre: [],
    year: null,
    duration: 0,
    bitrate: null,
    sampleRate: null,
    artworkBytes: null,
    artworkMime: null,
    embeddedLyrics: null,
  };
}

self.onmessage = async (event) => {
  const { jobId, file } = event.data || {};

  if (!jobId || !file) {
    return;
  }

  const startedAt = performance.now();

  try {
    /*
     * This is intentionally the fast metadata pass.
     *
     * Embedded artwork is handled separately, so music-metadata does not
     * need to extract and materialize cover images for every track.
     */
    const metadata = await parseBlob(file, {
      duration: false,
      skipCovers: true,
    });

    const { common, format } = metadata;

    const embeddedLyrics = extractEmbeddedLyrics(common.lyrics);

    const result = {
      title: common.title || null,
      artist: common.artist || common.albumartist || null,
      album: common.album || null,
      albumArtist: common.albumartist || common.artist || null,
      trackNumber: common.track?.no ?? null,
      discNumber: common.disk?.no ?? null,
      genre: common.genre || [],
      year: common.year || null,
      duration: format.duration || 0,
      bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
      sampleRate: format.sampleRate || null,

      /*
       * Deliberately empty. Cover extraction happens separately.
       */
      artworkBytes: null,
      artworkMime: null,

      embeddedLyrics,
    };

    self.postMessage({
      type: "result",
      jobId,
      ok: true,
      tags: result,
      parseMs: Math.round(performance.now() - startedAt),
    });
  } catch (err) {
    /*
     * A bad file should never kill a worker or the scan.
     *
     * Return a valid empty metadata record so the song can still be
     * represented as a playable file.
     */
    self.postMessage({
      type: "result",
      jobId,
      ok: false,
      tags: createEmptyMetadata(),
      error: {
        message: err?.message || String(err),
      },
      parseMs: Math.round(performance.now() - startedAt),
    });
  }
};
