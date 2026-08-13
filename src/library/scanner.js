// src/library/scanner.js — full updated file (no lyric work; embedded artwork sourced from the single worker parse, hashed inline instead of re-parsed)
import { isSupportedFile, extensionOf } from "./formats.js";
import { parseFileMetadata } from "./metadataParser.js";
import { resolveFileHandles } from "./resolveFile.js";
import { mapWithConcurrency } from "./concurrency.js";
import { makeEmbeddedArtworkKey } from "../artwork/embeddedArtwork.js";
import { createArtworkHashCache } from "../db/artworkRepo.js";
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
 * This limits how many parse requests the scanner has in flight at once.
 * The metadata worker pool has its own worker count, so this is the number
 * of jobs we allow the scanner to have pending against that pool.
 */
const PARSE_CONCURRENCY = 4;

/*
 * How many parsed songs get resolved/written per IndexedDB transaction.
 */
const WRITE_BATCH_SIZE = 40;

/*
 * How many new-file placeholders are written per discovery transaction.
 */
const DISCOVERY_BATCH_SIZE = 80;

/*
 * Flush discovery periodically even when the batch hasn't filled.
 */
const DISCOVERY_FLUSH_INTERVAL_MS = 400;

/*
 * Prevent excessive React/UI progress updates.
 */
const PROGRESS_THROTTLE_MS = 150;

/*
 * Temporary performance diagnostics.
 *
 * Set this to false once the Android metadata-parsing fix has been
 * confirmed in the field.
 */
const DEBUG_SCAN_TIMING = true;

/**
 * Recursively walks a directory handle and yields every supported audio file.
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
 * Trailing-edge throttle.
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
 * Best-effort ETA from the current processing rate.
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
 * - metadata parsing goes through the worker pool (see metadataWorker.js /
 *   parseAudioFile.js for the Android performance fix)
 * - IndexedDB writes are batched
 * - embedded artwork comes straight out of the same worker parse as the
 *   rest of the tags — metadataWorker.js no longer skips covers, so there
 *   is no second read/parse of the file to get artwork. The only work left
 *   to do here is hash the bytes, since crypto.subtle can't be awaited
 *   inside batchEnrichRepo's open IDB transaction; hashArtworkCached
 *   memoizes that per album so a whole album's worth of identical embedded
 *   covers only gets hashed once.
 * - lyrics are never touched here at all — see lyricsResolver.js, which is
 *   only invoked lazily when the user opens the Lyrics view for a song.
 */
async function enrichQueued(
  queue,
  { onProgress, totalStats, notify, sharedCaches, hashArtworkCached } = {},
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

  let writeChain = Promise.resolve();

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

          for (const result of results) {
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
    const { path, file, dirHandleId } = item;

    try {
      /*
       * This now runs through metadataWorkerPool.js.
       */
      const metadataStartedAt = performance.now();

      const tags = await parseFileMetadata(file);

      const metadataWaitMs = performance.now() - metadataStartedAt;

      /*
       * Embedded artwork (if any) is already sitting in tags.artworkBytes
       * from the parse above — no extra read. All that's left is hashing
       * it, memoized per album so an album's worth of identical covers
       * only costs one crypto.subtle.digest call, not one per track.
       */
      let artworkHash = null;

      if (tags.artworkBytes) {
        const artworkKey =
          makeEmbeddedArtworkKey({
            artist: tags.artist,
            albumArtist: tags.albumArtist,
            album: tags.album,
            year: tags.year,
          }) ?? path;

        artworkHash = await hashArtworkCached(artworkKey, tags.artworkBytes);
      }

      /*
       * DEBUG TIMING
       *
       * metadataWaitMs is intentionally measured from the main
       * thread. It includes time waiting for an available worker.
       *
       * If worker parsing itself reports ~100 ms but this says
       * 1500 ms, the problem is worker queue/file transfer pressure.
       */
      if (DEBUG_SCAN_TIMING) {
        console.debug("[motif/scan:metadata]", {
          file: file.name,
          path,
          sizeMB: Number((file.size / 1024 / 1024).toFixed(2)),
          metadataWaitMs: Math.round(metadataWaitMs),
          artist: tags.artist || null,
          title: tags.title || null,
          album: tags.album || null,
          hasArtwork: Boolean(tags.artworkBytes),
        });
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
        artworkHash,
      });
    } catch (err) {
      totalStats.errors += 1;

      console.warn(`[motif/scanner] failed to read ${path}:`, err);
    }

    /*
     * Fire and forget. Parsing should continue while the serialized
     * IndexedDB write chain drains in batches.
     */
    drain(false);
  });

  await drain(true);

  emitProgress?.cancel();
}

/**
 * Scans a root directory in two phases:
 *
 * 1. Discovery
 * 2. Metadata/enrichment
 */
export async function scanDirectory(
  dirHandleRecord,
  { onProgress, sharedCaches } = {},
) {
  const scanStartedAt = performance.now();

  beginScanActivity();

  try {
    const { handle, id: dirHandleId } = dirHandleRecord;

    const notify = makeThrottledNotifier();

    const emitProgress = onProgress
      ? makeThrottled(onProgress, PROGRESS_THROTTLE_MS)
      : null;

    /*
     * Bulk IndexedDB lookup.
     */
    const existingReadStartedAt = performance.now();

    const existingByPath = await getSongsMapForDir(dirHandleId);

    if (DEBUG_SCAN_TIMING) {
      console.debug("[motif/scan:database]", {
        operation: "getSongsMapForDir",
        ms: Math.round(performance.now() - existingReadStartedAt),
        existingSongs: existingByPath.size,
      });
    }

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

      const writeStartedAt = performance.now();

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

      if (DEBUG_SCAN_TIMING) {
        console.debug("[motif/scan:database]", {
          operation: "seedPlaceholdersBatch",
          count: batch.length,
          ms: Math.round(performance.now() - writeStartedAt),
        });
      }

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

    /*
     * Discovery timing is split into:
     *
     * - directory iteration delay
     * - getFile() duration
     *
     * We intentionally do NOT include metadata parsing here.
     */
    let previousEntryAt = performance.now();

    for await (const { fileHandle, parentHandle, path } of walk(handle)) {
      const entryArrivedAt = performance.now();

      i += 1;

      stillPresent.add(path);

      let file = null;

      try {
        /*
         * This is the key measurement.
         *
         * If this number is high on mobile, we know File System Access
         * is contributing materially to the scan time.
         */
        const getFileStartedAt = performance.now();

        file = await fileHandle.getFile();

        const getFileMs = performance.now() - getFileStartedAt;

        const enumerationGapMs = entryArrivedAt - previousEntryAt;

        previousEntryAt = performance.now();

        const existing = existingByPath.get(path);

        const unchanged =
          existing &&
          !existing.pending &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified;

        if (DEBUG_SCAN_TIMING) {
          console.debug("[motif/scan:filesystem]", {
            index: i,
            path,
            getFileMs: Math.round(getFileMs),
            enumerationGapMs: Math.round(enumerationGapMs),
            sizeMB: Number((file.size / 1024 / 1024).toFixed(2)),
            lastModified: file.lastModified,
            unchanged: Boolean(unchanged),
          });
        }

        if (unchanged) {
          stats.unchanged += 1;
        } else if (existing) {
          /*
           * Changed file or unfinished previous scan.
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
       * Yield to the browser every 25 entries so directory enumeration
       * itself cannot monopolize the main thread.
       */
      if (i % 25 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    await flushPlaceholders(true);

    /*
     * Missing-file detection is an in-memory diff.
     */
    const missing = [];

    for (const [path, song] of existingByPath) {
      if (!stillPresent.has(path)) {
        missing.push(song);
      }
    }

    let removed = 0;

    if (missing.length) {
      const removeStartedAt = performance.now();

      await removeSongsBatch(missing);

      removed = missing.length;

      if (DEBUG_SCAN_TIMING) {
        console.debug("[motif/scan:database]", {
          operation: "removeSongsBatch",
          count: missing.length,
          ms: Math.round(performance.now() - removeStartedAt),
        });
      }
    }

    notify();

    const totalStats = {
      created: 0,
      updated: 0,
      unchanged: stats.unchanged,
      removed,
      errors: stats.errors,
    };

    /*
     * One hash cache for the entire scan means tracks belonging to the
     * same album only get their embedded cover hashed once.
     */
    const hashArtworkCached = createArtworkHashCache();

    const enrichmentStartedAt = performance.now();

    await enrichQueued(toEnrich, {
      onProgress: emitProgress,
      totalStats,
      notify,
      sharedCaches: sharedCaches ?? createEnrichmentCaches(),
      hashArtworkCached,
    });

    /*
     * Because artwork extraction now happens inline as part of the
     * metadata parse (rather than as separate background work), this
     * timing DOES include it.
     */
    if (DEBUG_SCAN_TIMING) {
      console.debug("[motif/scan:summary]", {
        totalScanMs: Math.round(performance.now() - scanStartedAt),
        enrichmentMs: Math.round(performance.now() - enrichmentStartedAt),
        filesDiscovered: stats.scanned,
        filesUnchanged: stats.unchanged,
        filesChanged: stats.changed,
        filesNew: stats.seeded,
        filesEnriched: toEnrich.length,
        filesRemoved: removed,
        errors: totalStats.errors,
      });
    }

    emitProgress?.cancel();

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

    if (DEBUG_SCAN_TIMING) {
      console.debug("[motif/scan:summary]", {
        event: "scan finished",
      });
    }
  }
}

/**
 * Finishes enrichment for songs that remained pending after an interrupted
 * scan.
 */
export async function resumePendingEnrichment({ onProgress } = {}) {
  const scanStartedAt = performance.now();

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

    const hashArtworkCached = createArtworkHashCache();

    await enrichQueued(queue, {
      onProgress,
      totalStats,
      notify,
      sharedCaches: createEnrichmentCaches(),
      hashArtworkCached,
    });

    if (DEBUG_SCAN_TIMING) {
      console.debug("[motif/scan:summary]", {
        event: "pending enrichment finished",
        totalMs: Math.round(performance.now() - scanStartedAt),
        pendingCount: pending.length,
      });
    }

    notifyLibraryChanged();

    return totalStats;
  } finally {
    endScanActivity();
  }
}
