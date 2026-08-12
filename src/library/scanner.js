import { isSupportedFile, extensionOf } from "./formats.js";
import { parseFileMetadata } from "./metadataParser.js";
import { mergeLyrics } from "./lyrics.js";
import { resolveFileHandles } from "./resolveFile.js";
import { mapWithConcurrency } from "./concurrency.js";
import {
  createEmbeddedArtworkResolver,
  makeEmbeddedArtworkKey,
} from "../artwork/embeddedArtwork.js";
import { registerEmbeddedArtwork } from "../artwork/artworkManager.js";
import {
  enrichSongsBatch,
  createEnrichmentCaches,
} from "../db/batchEnrichRepo.js";
import {
  getSongsMapForDir,
  seedPlaceholdersBatch,
  removeSongsBatch,
  getPendingSongs,
} from "../db/songsRepo.js";
import { notifyLibraryChanged } from "../state/libraryBus.js";
import { notifySongUpdated } from "../state/songUpdateBus.js";
import { beginScanActivity, endScanActivity } from "./scanState.js";

/*
 * This limits how many parse requests the scanner puts into the metadata
 * worker pool at once.
 *
 * The worker pool itself is also bounded based on hardwareConcurrency, so
 * this is intentionally not aggressive. Four queued parser jobs is enough
 * to keep the workers fed without creating a large number of pending File
 * objects on the main thread.
 */
const PARSE_CONCURRENCY = 4;

/*
 * Parsed songs are persisted in batches. This is separate from metadata
 * parsing concurrency.
 */
const WRITE_BATCH_SIZE = 40;

/*
 * New-file placeholder writes during discovery.
 */
const DISCOVERY_BATCH_SIZE = 80;

/*
 * Also flush discovery after a short amount of time so small libraries do not
 * wait for the full discovery batch before their rows appear.
 */
const DISCOVERY_FLUSH_INTERVAL_MS = 400;

/*
 * Don't push one React state update for every file.
 */
const PROGRESS_THROTTLE_MS = 150;

/**
 * Recursively walks a directory handle and yields supported audio files.
 *
 * parentHandle is retained so a sibling .lrc file can be checked without
 * walking the directory tree again.
 */
async function* walk(dirHandle, relativePath = "") {
  for await (const [name, handle] of dirHandle.entries()) {
    const path = relativePath ? `${relativePath}/${name}` : name;

    if (handle.kind === "directory") {
      yield* walk(handle, path);
    } else if (isSupportedFile(name)) {
      yield {
        fileHandle: handle,
        parentHandle: dirHandle,
        path,
      };
    }
  }
}

/**
 * Reads a sidecar .lrc file next to a track.
 */
async function readSidecarLrc(parentHandle, fileName) {
  const lrcName = fileName.replace(/\.[^./]+$/, "") + ".lrc";

  try {
    const lrcHandle = await parentHandle.getFileHandle(lrcName);

    const lrcFile = await lrcHandle.getFile();

    return await lrcFile.text();
  } catch {
    return null;
  }
}

/**
 * Trailing-edge throttle.
 *
 * The most recent arguments always win, so the UI cannot get stuck with an
 * older progress state.
 */
function makeThrottled(fn, minIntervalMs) {
  let last = 0;
  let timer = null;
  let latestArgs = null;

  const flush = () => {
    clearTimeout(timer);
    timer = null;
    last = Date.now();

    if (latestArgs) {
      fn(...latestArgs);
    }
  };

  const call = (...args) => {
    latestArgs = args;

    const now = Date.now();

    if (now - last >= minIntervalMs) {
      flush();
    } else if (!timer) {
      timer = setTimeout(flush, minIntervalMs - (now - last));
    }
  };

  call.cancel = () => {
    clearTimeout(timer);
    timer = null;
    latestArgs = null;
  };

  return call;
}

function makeThrottledNotifier(minIntervalMs = 400) {
  return makeThrottled(() => notifyLibraryChanged(), minIntervalMs);
}

/**
 * Best-effort remaining-time estimate.
 */
function estimateRemainingMs(done, total, startedAt) {
  if (done <= 0 || done >= total) {
    return null;
  }

  const elapsed = Date.now() - startedAt;

  const rate = done / elapsed;

  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  return Math.round((total - done) / rate);
}

/**
 * Phase 2:
 *
 * 1. Metadata parsing happens concurrently through the metadata worker pool.
 * 2. Parsed songs are written to IndexedDB in batches.
 * 3. Embedded artwork extraction happens independently of the metadata write.
 * 4. Artwork is only associated with an album AFTER the database returns the
 *    real albumId for that song.
 *
 * That last point is important. The old implementation could begin artwork
 * work before the corresponding album existed in IndexedDB, creating a race
 * between artwork extraction and album creation.
 */
async function enrichQueued(
  queue,
  {
    onProgress,
    totalStats,
    notify,
    sharedCaches,
    embeddedArtworkResolver,
  } = {},
) {
  const total = queue.length;

  if (!total) {
    return;
  }

  const emitProgress = onProgress
    ? makeThrottled(onProgress, PROGRESS_THROTTLE_MS)
    : null;

  const startedAt = Date.now();

  const totalBatches = Math.ceil(total / WRITE_BATCH_SIZE);

  let batchIndex = 0;
  let writtenCount = 0;

  const pendingWrite = [];

  /*
   * This map exists only until the corresponding write batch finishes.
   *
   * path -> {
   *   artworkKey,
   *   artworkPromise
   * }
   *
   * We retain the promise itself rather than its result so artwork extraction
   * can continue independently while IndexedDB is writing the song.
   */
  const embeddedArtworkByPath = new Map();

  /*
   * Prevents the same album from being registered multiple times when
   * several tracks from the album complete in the same or different batches.
   */
  const registeredEmbeddedAlbums = new Set();

  let writeChain = Promise.resolve();

  /**
   * Queues a background registration of embedded artwork after a database
   * batch has produced the actual albumId.
   */
  function registerArtworkForResult(result, artworkInfo) {
    if (!result?.ok || !result.song || !artworkInfo) {
      return;
    }

    const albumId = result.song.albumId;

    if (!albumId) {
      return;
    }

    const { artworkKey, artworkPromise } = artworkInfo;

    if (!artworkKey || !artworkPromise) {
      return;
    }

    const registrationKey = `${artworkKey}|${albumId}`;

    if (registeredEmbeddedAlbums.has(registrationKey)) {
      return;
    }

    registeredEmbeddedAlbums.add(registrationKey);

    /*
     * Deliberately do not await this.
     *
     * Artwork is secondary to metadata. A slow cover extraction must never
     * hold up the next IndexedDB batch.
     */
    artworkPromise
      .then((artwork) => {
        if (!artwork?.artworkId) {
          return null;
        }

        return registerEmbeddedArtwork({
          albumId,
          artist: result.song.albumArtist || result.song.artist || null,
          album: result.song.album || null,
          artworkId: artwork.artworkId,
        });
      })
      .catch((err) => {
        console.warn(
          "[motif/scanner] failed to register embedded artwork:",
          err?.message || err,
        );
      });
  }

  function drain(force) {
    writeChain = writeChain.then(async () => {
      while (
        pendingWrite.length >= WRITE_BATCH_SIZE ||
        (force && pendingWrite.length > 0)
      ) {
        const chunk = pendingWrite.splice(0, WRITE_BATCH_SIZE);

        batchIndex += 1;

        try {
          const results = await enrichSongsBatch(chunk, sharedCaches);

          for (let index = 0; index < results.length; index += 1) {
            const result = results[index];

            if (!result.ok) {
              totalStats.errors += 1;

              console.warn(
                `[motif/scanner] failed to enrich ${result.path}:`,
                result.error,
              );

              continue;
            }

            totalStats[result.isNew ? "created" : "updated"] += 1;

            notifySongUpdated(result.song);

            /*
             * The chunk item is the exact item that
             * produced this result. This avoids looking up
             * artwork through stale global state.
             */
            const sourceItem = chunk[index];

            const artworkInfo = embeddedArtworkByPath.get(sourceItem.path);

            registerArtworkForResult(result, artworkInfo);

            embeddedArtworkByPath.delete(sourceItem.path);
          }
        } catch (err) {
          totalStats.errors += chunk.length;

          console.warn("[motif/scanner] batch write failed:", err);
        }

        writtenCount += chunk.length;

        notify();

        emitProgress?.({
          ...totalStats,
          phase: "enriching",
          enrichedCount: writtenCount,
          enrichedTotal: total,
          batchIndex,
          totalBatches,
          etaMs: estimateRemainingMs(writtenCount, total, startedAt),
        });
      }
    });

    return writeChain;
  }

  await mapWithConcurrency(queue, PARSE_CONCURRENCY, async (item) => {
    const { parentHandle, path, file, dirHandleId } = item;

    try {
      /*
       * This now runs through metadataWorkerPool.js.
       *
       * The main thread only waits for the worker response; the
       * music-metadata parsing itself happens off-thread.
       */
      const tags = await parseFileMetadata(file);

      const lrcText = await readSidecarLrc(parentHandle, file.name);

      tags.lyrics = mergeLyrics({
        lrcText,
        embedded: tags.embeddedLyrics,
      });

      /*
       * Embedded artwork is started independently.
       *
       * The resolver deduplicates this by artist/album/year, so
       * multiple tracks from the same album share one extraction.
       *
       * IMPORTANT:
       * We only retain the promise here. The actual albumId isn't
       * known until enrichSongsBatch() has created/resolved the song.
       */
      let artworkInfo = null;

      const artworkKey = makeEmbeddedArtworkKey({
        artist: tags.artist,
        albumArtist: tags.albumArtist,
        album: tags.album,
        year: tags.year,
      });

      if (artworkKey && embeddedArtworkResolver) {
        const artworkPromise = embeddedArtworkResolver.getOrExtract({
          key: artworkKey,
          file,
        });

        artworkInfo = {
          artworkKey,
          artworkPromise,
        };
      }

      /*
       * Store the artwork promise alongside this exact song path.
       *
       * It is not necessary to wait for artwork before inserting the
       * song into IndexedDB.
       */
      if (artworkInfo) {
        embeddedArtworkByPath.set(path, artworkInfo);
      }

      emitProgress?.({
        ...totalStats,
        phase: "enriching",
        enrichedCount: writtenCount,
        enrichedTotal: total,
        currentFile: tags.artist
          ? `${tags.artist} — ${tags.title || file.name}`
          : file.name,
        batchIndex,
        totalBatches,
        etaMs: estimateRemainingMs(writtenCount, total, startedAt),
      });

      pendingWrite.push({
        path,
        dirHandleId,
        fileName: file.name,
        format: extensionOf(file.name),
        size: file.size,
        lastModified: file.lastModified,
        tags,
      });
    } catch (err) {
      totalStats.errors += 1;

      console.warn(`[motif/scanner] failed to read ${path}:`, err);
    }

    /*
     * Do not await the write chain here. Parsing workers should stay
     * busy while IndexedDB drains in the background.
     */
    drain(false);
  });

  /*
   * Flush the final partial batch.
   */
  await drain(true);

  /*
   * If a malformed/failed batch somehow left artwork entries behind,
   * don't allow them to live forever in the scan-scoped map.
   */
  embeddedArtworkByPath.clear();

  emitProgress?.cancel();
}

/**
 * Scans a root directory in two phases:
 *
 * 1. Discovery
 * 2. Metadata/enrichment
 *
 * Embedded artwork runs independently during phase 2.
 */
export async function scanDirectory(
  dirHandleRecord,
  { onProgress, sharedCaches } = {},
) {
  beginScanActivity();

  try {
    const { handle, id: dirHandleId } = dirHandleRecord;

    const notify = makeThrottledNotifier();

    const emitProgress = onProgress
      ? makeThrottled(onProgress, PROGRESS_THROTTLE_MS)
      : null;

    /*
     * One bulk IndexedDB read for the directory.
     */
    const existingByPath = await getSongsMapForDir(dirHandleId);

    const stillPresent = new Set();

    const toEnrich = [];

    let pendingNew = [];

    let lastFlush = Date.now();

    const stats = {
      scanned: 0,
      seeded: 0,
      changed: 0,
      unchanged: 0,
      errors: 0,
    };

    async function flushPlaceholders(force) {
      if (!pendingNew.length) {
        return;
      }

      if (
        !force &&
        pendingNew.length < DISCOVERY_BATCH_SIZE &&
        Date.now() - lastFlush < DISCOVERY_FLUSH_INTERVAL_MS
      ) {
        return;
      }

      const batch = pendingNew;

      pendingNew = [];

      lastFlush = Date.now();

      await seedPlaceholdersBatch(
        batch.map(
          ({
            path,
            dirHandleId: dh,
            fileName,
            format,
            size,
            lastModified,
          }) => ({
            path,
            dirHandleId: dh,
            fileName,
            format,
            size,
            lastModified,
          }),
        ),
      );

      for (const item of batch) {
        toEnrich.push({
          parentHandle: item.parentHandle,
          path: item.path,
          file: item.file,
          dirHandleId: item.dirHandleId,
        });
      }

      notify();
    }

    let i = 0;

    for await (const { fileHandle, parentHandle, path } of walk(handle)) {
      i += 1;

      stillPresent.add(path);

      try {
        /*
         * getFile() here is cheap. We're obtaining a File object and
         * its metadata, not asking the browser to read the whole audio
         * file.
         */
        const file = await fileHandle.getFile();

        const existing = existingByPath.get(path);

        if (
          existing &&
          !existing.pending &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified
        ) {
          stats.unchanged += 1;
        } else if (existing) {
          /*
           * Changed file or incomplete previous scan.
           */
          toEnrich.push({
            parentHandle,
            path,
            file,
            dirHandleId,
          });

          stats.changed += 1;
        } else {
          pendingNew.push({
            path,
            dirHandleId,
            fileName: file.name,
            format: extensionOf(file.name),
            size: file.size,
            lastModified: file.lastModified,
            parentHandle,
            file,
          });

          stats.seeded += 1;

          await flushPlaceholders(false);
        }
      } catch (err) {
        stats.errors += 1;

        console.warn(`[motif/scanner] failed on ${path}:`, err);
      }

      stats.scanned = i;

      emitProgress?.({
        ...stats,
        currentFile: path,
        phase: "discovering",
      });

      /*
       * Yield periodically so a very large library cannot monopolize
       * the main thread during directory enumeration.
       */
      if (i % 25 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    /*
     * Flush any final new-file placeholders.
     */
    await flushPlaceholders(true);

    /*
     * Missing-file detection is now entirely in memory because
     * existingByPath was fetched at the beginning of the scan.
     */
    const missing = [];

    for (const [path, song] of existingByPath) {
      if (!stillPresent.has(path)) {
        missing.push(song);
      }
    }

    if (missing.length) {
      await removeSongsBatch(missing);
    }

    const removed = missing.length;

    notify();

    const totalStats = {
      created: 0,
      updated: 0,
      unchanged: stats.unchanged,
      removed,
      errors: stats.errors,
    };

    /*
     * One resolver for the entire scan.
     *
     * This is important because it allows:
     *
     *   Track 1
     *   Track 2
     *   Track 3
     *
     * from the same album to share the same embedded-art extraction.
     */
    const embeddedArtworkResolver = createEmbeddedArtworkResolver({
      concurrency: 1,
    });

    await enrichQueued(toEnrich, {
      onProgress: emitProgress,
      totalStats,
      notify,
      sharedCaches: sharedCaches ?? createEnrichmentCaches(),
      embeddedArtworkResolver,
    });

    emitProgress?.cancel();

    /*
     * Final authoritative UI/library update.
     */
    notifyLibraryChanged();

    onProgress?.({
      ...totalStats,
      currentFile: null,
      done: true,
      phase: "done",
    });

    return totalStats;
  } finally {
    endScanActivity();
  }
}

/**
 * Finishes enrichment for any songs that remained pending after an interrupted
 * scan.
 */
export async function resumePendingEnrichment({ onProgress } = {}) {
  beginScanActivity();

  try {
    const pending = await getPendingSongs();

    const totalStats = {
      created: 0,
      updated: 0,
      unchanged: 0,
      removed: 0,
      errors: 0,
    };

    if (!pending.length) {
      return totalStats;
    }

    const notify = makeThrottledNotifier();

    const queue = [];

    for (const song of pending) {
      try {
        const { fileHandle, parentHandle } = await resolveFileHandles(song);

        const file = await fileHandle.getFile();

        queue.push({
          parentHandle,
          path: song.path,
          file,
          dirHandleId: song.dirHandleId,
        });
      } catch (err) {
        totalStats.errors += 1;

        console.warn(
          "[motif/scanner] could not resume pending song",
          song.path,
          err,
        );
      }
    }

    const embeddedArtworkResolver = createEmbeddedArtworkResolver({
      concurrency: 1,
    });

    await enrichQueued(queue, {
      onProgress,
      totalStats,
      notify,
      sharedCaches: createEnrichmentCaches(),
      embeddedArtworkResolver,
    });

    notifyLibraryChanged();

    return totalStats;
  } finally {
    endScanActivity();
  }
}
