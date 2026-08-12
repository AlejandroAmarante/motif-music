import { parseMetadataInWorker } from "./metadataWorkerPool.js";

const DEBUG_METADATA_TIMING = false;

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

/**
 * Parses metadata through the persistent worker pool.
 *
 * The expensive music-metadata operation is no longer performed on the
 * browser's main/UI thread.
 *
 * Embedded cover artwork is deliberately excluded from this pass.
 * See artwork/embeddedArtwork.js.
 */
export async function parseFileMetadata(file) {
  const startedAt = typeof performance !== "undefined" ? performance.now() : 0;

  try {
    const result = await parseMetadataInWorker(file);

    if (DEBUG_METADATA_TIMING) {
      const totalMs =
        typeof performance !== "undefined" ? performance.now() - startedAt : 0;

      console.debug("[motif/metadata]", {
        file: file.name,
        fileMB: Number((file.size / 1024 / 1024).toFixed(2)),
        workerParseMs: result.parseMs,
        mainThreadMs: Math.round(totalMs),
        workerError: result.error || null,
      });
    }

    if (result?.tags) {
      return result.tags;
    }

    return createEmptyMetadata();
  } catch (err) {
    console.warn(
      `[motif/metadata] worker failed for ${file.name}:`,
      err?.message || err,
    );

    return createEmptyMetadata();
  }
}
