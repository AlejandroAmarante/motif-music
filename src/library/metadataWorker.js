// src/library/metadataWorker.js — full updated file (parses via parseAudioFile; re-integrates embedded artwork; no lyric work)
import { extractEmbeddedLyrics } from "./lyrics.js";
import { parseAudioFile } from "./parseAudioFile.js";

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
     * See parseAudioFile.js for why this reads the whole file once
     * instead of going through parseBlob's chunked Blob reads — that
     * switch is the actual fix for the Android metadata-parsing stall.
     *
     * skipCovers is false again: embedded artwork is extracted from this
     * SAME parse below, so re-enabling it costs nothing extra — no second
     * read or second parse of the file (see scanner.js / embeddedArtwork.js,
     * which used to do exactly that as a separate main-thread pass).
     */
    const metadata = await parseAudioFile(file, {
      duration: false,
      skipCovers: false,
    });

    const { common, format } = metadata;

    const embeddedLyrics = extractEmbeddedLyrics(common.lyrics);

    const picture = common.picture?.[0];
    const artworkBytes = picture?.data?.byteLength ? picture.data : null;
    const artworkMime = artworkBytes
      ? picture.format || "application/octet-stream"
      : null;

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

      artworkBytes,
      artworkMime,

      embeddedLyrics,
    };

    // Transfer the picture bytes' backing buffer instead of structured-
    // cloning (copying) it back to the main thread — cheap to do, and
    // avoids doubling memory for whatever the embedded cover happens to
    // weigh.
    const transferList = artworkBytes ? [artworkBytes.buffer] : [];

    self.postMessage(
      {
        type: "result",
        jobId,
        ok: true,
        tags: result,
        parseMs: Math.round(performance.now() - startedAt),
      },
      transferList,
    );
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
