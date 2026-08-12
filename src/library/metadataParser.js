// src/library/metadataParser.js

import { parseMetadataInWorker } from "./metadataWorkerPool.js";

const DEBUG_METADATA_TIMING = true;

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
 * Parses a file through the persistent metadata worker pool.
 *
 * The expensive music-metadata work runs in a dedicated worker rather than
 * blocking the main/UI thread.
 *
 * Embedded artwork is intentionally excluded from this pass. It is extracted
 * separately by artwork/embeddedArtwork.js so large cover images do not make
 * the normal metadata scan more expensive than necessary.
 */
export async function parseFileMetadata(file) {
  const startedAt = typeof performance !== "undefined" ? performance.now() : 0;

  try {
    const result = await parseMetadataInWorker(file);

    const totalMs =
      typeof performance !== "undefined" ? performance.now() - startedAt : 0;

    if (DEBUG_METADATA_TIMING) {
      console.debug("[motif/metadata]", {
        file: file.name,
        fileMB: Number((file.size / 1024 / 1024).toFixed(2)),

        /*
         * parseMs is measured inside the worker, so this tells us how
         * long music-metadata actually spent parsing the file.
         */
        workerParseMs: result?.parseMs ?? null,

        /*
         * mainThreadMs is how long this call waited from the scanner's
         * perspective. The difference between this and workerParseMs is
         * especially useful for identifying worker queueing or
         * structured-clone/file-transfer overhead.
         */
        mainThreadMs: Math.round(totalMs),

        workerQueueOrTransferMs:
          result?.parseMs != null
            ? Math.max(0, Math.round(totalMs - result.parseMs))
            : null,

        workerError: result?.error ?? null,
      });
    }

    if (result?.tags) {
      return result.tags;
    }

    return createEmptyMetadata();
  } catch (err) {
    const totalMs =
      typeof performance !== "undefined" ? performance.now() - startedAt : 0;

    console.warn(
      `[motif/metadata] worker failed for ${file.name}:`,
      err?.message || err,
    );

    if (DEBUG_METADATA_TIMING) {
      console.debug("[motif/metadata]", {
        file: file.name,
        fileMB: Number((file.size / 1024 / 1024).toFixed(2)),
        mainThreadMs: Math.round(totalMs),
        workerFailed: true,
      });
    }

    return createEmptyMetadata();
  }
}
