// src/library/scanner.js — discovery is now batched (bulk existence-check read + batched placeholder writes + batched missing-file removal) instead of one IndexedDB transaction per file; enrichment progress now reports current file, batch index, and an ETA; artist/album/genre/artwork resolution can be shared across the whole scan instead of resetting every batch
import { isSupportedFile, extensionOf } from "./formats.js";
import { parseFileMetadata } from "./metadataParser.js";
import { mergeLyrics } from "./lyrics.js";
import { resolveFileHandles } from "./resolveFile.js";
import { mapWithConcurrency } from "./concurrency.js";
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

// How many files get read and tag-parsed at once. This is the part that's
// genuinely safe to parallelize — real file I/O with real waits, no
// shared state, no IndexedDB contention (writes are batched separately,
// see WRITE_BATCH_SIZE below). Clamped to the device's actual core count
// (capped at 4) rather than hard-coded, since pushing more concurrent
// parses than a mobile SoC has cores to run them on doesn't parallelize
// anything further — it just adds contention.
const PARSE_CONCURRENCY = Math.max(
  2,
  Math.min(
    4,
    (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4,
  ),
);

// How many parsed songs get resolved (artist/album/genre/artwork) and
// written per IndexedDB transaction. This is the actual fix for
// enrichment feeling slow: a single song used to cost ~15-20 separate
// transactions on its own (one each for the track artist, album artist,
// album, a nested one for the artist's albumCount, one per genre, one for
// artwork, the song itself, then two more for count bookkeeping) — that
// per-transaction overhead, not tag parsing, was the real bottleneck.
// Batching lets songs sharing an artist/album (extremely common — most of
// an album gets discovered in the same pass) resolve against each other
// in memory instead of hitting IndexedDB again each time.
const WRITE_BATCH_SIZE = 40;

// How many new-file placeholders get written per IndexedDB transaction
// during discovery. Larger than WRITE_BATCH_SIZE because a placeholder
// write is much cheaper than an enrichment write — no artist/album/genre
// resolution, just a straight insert — so more can be batched together
// before the transaction itself becomes the limiting factor.
const DISCOVERY_BATCH_SIZE = 80;
// ...and a time-based flush on top of the count-based one, so a very
// large single folder still seeds visible rows at a steady cadence
// instead of going quiet for a long stretch while the count threshold
// slowly fills.
const DISCOVERY_FLUSH_INTERVAL_MS = 400;

// How often progress callbacks are actually allowed to reach the UI.
// Parsing and writing can each produce far more updates than a screen
// can usefully show (up to one per file); throttling here is what keeps
// "richer progress" from turning into "more React re-renders than a
// phone wants to do while it's also trying to parse audio tags."
const PROGRESS_THROTTLE_MS = 150;

/**
 * Recursively walks a directory handle, yielding every supported audio
 * file as { fileHandle, parentHandle, path }. parentHandle lets us look
 * for a sibling .lrc lyrics file without re-walking the tree.
 */
async function* walk(dirHandle, relativePath = "") {
  for await (const [name, handle] of dirHandle.entries()) {
    const path = relativePath ? `${relativePath}/${name}` : name;
    if (handle.kind === "directory") {
      yield* walk(handle, path);
    } else if (isSupportedFile(name)) {
      yield { fileHandle: handle, parentHandle: dirHandle, path };
    }
  }
}

/** Reads a sidecar song.lrc next to song.mp3, if one exists. Absence is the common case, not an error. */
async function readSidecarLrc(parentHandle, fileName) {
  const lrcName = fileName.replace(/\.[^./]+$/, "") + ".lrc";
  try {
    const lrcHandle = await parentHandle.getFileHandle(lrcName);
    const lrcFile = await lrcHandle.getFile();
    return await lrcFile.text();
  } catch {
    return null; // no sidecar file — normal, not logged
  }
}

/**
 * Throttles calls to `fn` to at most one per `minIntervalMs`, always using
 * the most recent arguments — a call inside the window schedules a
 * trailing call with its (possibly updated) args rather than being
 * dropped, so the UI never permanently misses the latest state. Exposes
 * `.cancel()` so a caller that's about to send its OWN final, authoritative
 * update (e.g. "scan complete") can guarantee a stale trailing call won't
 * land after it and flip the UI back to "still scanning."
 */
function makeThrottled(fn, minIntervalMs) {
  let last = 0;
  let timer = null;
  let latestArgs = null;
  const flush = () => {
    clearTimeout(timer);
    timer = null;
    last = Date.now();
    if (latestArgs) fn(...latestArgs);
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

/**
 * notifyLibraryChanged() triggers a real refetch of the library's sorted
 * id list (see useVirtualSongs) — calling it after every single file
 * during a large scan would mean thousands of redundant IndexedDB scans
 * competing with the scan itself. This coalesces bursts into one call
 * roughly every `minIntervalMs`, trailing-edge, so the UI still visibly
 * grows in near-real-time without that cost. Scoped to one scan/resume
 * call rather than shared globally, since scans already run sequentially.
 */
function makeThrottledNotifier(minIntervalMs = 400) {
  return makeThrottled(() => notifyLibraryChanged(), minIntervalMs);
}

/** Best-effort remaining-time estimate from a simple average rate — doesn't need to be exact, just needs to move in the right direction as the scan progresses. */
function estimateRemainingMs(done, total, startedAt) {
  if (done <= 0 || done >= total) return null;
  const elapsed = Date.now() - startedAt;
  const rate = done / elapsed; // items per ms
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round((total - done) / rate);
}

/**
 * Phase 2 (shared by scanDirectory and resumePendingEnrichment): reads
 * and tag-parses everything concurrently (PARSE_CONCURRENCY at a time),
 * while a separate, serialized chain drains whatever's parsed into
 * IndexedDB in batches of WRITE_BATCH_SIZE as it becomes available —
 * parsing keeps racing ahead at full concurrency the whole time, it's
 * only the actual writes that are serialized (one batch transaction in
 * flight at once; see enrichSongsBatch's own reasoning for why that's
 * still a huge win over one transaction per song).
 *
 * `sharedCaches` (see createEnrichmentCaches) lets artist/album/genre/
 * artwork resolution persist across every batch in this call instead of
 * resetting every WRITE_BATCH_SIZE songs.
 */
async function enrichQueued(
  queue,
  { onProgress, totalStats, notify, sharedCaches } = {},
) {
  const total = queue.length;
  if (!total) return;

  const emitProgress = onProgress
    ? makeThrottled(onProgress, PROGRESS_THROTTLE_MS)
    : null;
  const startedAt = Date.now();
  const totalBatches = Math.ceil(total / WRITE_BATCH_SIZE);
  let batchIndex = 0;

  const pendingWrite = [];
  let writtenCount = 0;
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
            notifySongUpdated(result.song); // flips this exact row from pending -> ready, wherever it's rendered
          }
        } catch (err) {
          // Whole-batch failure (e.g. the transaction itself aborted) —
          // treat everything in it as failed rather than losing track of
          // it silently. Individual bad items are already caught inside
          // enrichSongsBatch and don't reach this branch.
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

  const hashCached = createArtworkHashCache();

  await mapWithConcurrency(queue, PARSE_CONCURRENCY, async (item) => {
    const { parentHandle, path, file, dirHandleId } = item;
    try {
      const tags = await parseFileMetadata(file);
      const lrcText = await readSidecarLrc(parentHandle, file.name);
      tags.lyrics = mergeLyrics({ lrcText, embedded: tags.embeddedLyrics });

      // Tracks in the same folder are almost always the same album, and
      // almost always carry an identical embedded cover — skip re-hashing
      // bytes we've effectively already hashed for a sibling track. See
      // createArtworkHashCache for the (deliberately cheap) heuristic.
      const folderKey = path.includes("/")
        ? path.slice(0, path.lastIndexOf("/"))
        : "";
      const artworkHash = tags.artworkBytes
        ? await hashCached(folderKey, tags.artworkBytes)
        : null;

      // Best-effort "currently processing" signal. Fires once tags are
      // known (not at file-start) so it can show "Artist — Title" rather
      // than a bare filename, matching what's actually useful to read.
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
    drain(false); // fire-and-forget: keeps parsing going, doesn't wait on the write
  });

  await drain(true); // flush whatever's left — a final partial batch
  emitProgress?.cancel();
}

/**
 * Scans a root directory in two phases:
 *
 *  1. Discovery — compares the directory tree against what's already
 *     indexed. The existence check for every file used to be its own
 *     getByPath() IndexedDB transaction, and every brand-new file its own
 *     seedPlaceholder() write transaction — on mobile, where per-
 *     transaction IndexedDB latency is dramatically higher than on
 *     desktop, that per-file overhead (not the filesystem walk itself)
 *     was the actual cost of "discovery," and it's what turned into the
 *     apparent hang between file-finding and tag-reading. Discovery now
 *     does ONE bulk read of everything already indexed for this
 *     directory (getSongsMapForDir) and compares against it entirely in
 *     memory, and batches new-file placeholder writes instead of writing
 *     one per file (still frequently enough — every DISCOVERY_BATCH_SIZE
 *     files or DISCOVERY_FLUSH_INTERVAL_MS, whichever comes first — that
 *     new songs keep appearing in the UI in near-real-time).
 *  2. Enrichment — the actual tag/duration/artwork work, for everything
 *     phase 1 queued up (see enrichQueued above).
 *
 * Cooperative-yields to the event loop periodically during discovery so a
 * 250k-file library doesn't freeze the UI thread.
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

    // Single bulk read instead of a getByPath() round trip per file — see
    // the docstring above and getSongsMapForDir's own comment. This also
    // doubles as the source of truth for missing-file detection below, so
    // the old separate "fetch every known path, then diff" pass is gone.
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
      if (!pendingNew.length) return;
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
        const file = await fileHandle.getFile(); // cheap: file stats only, no content read
        const existing = existingByPath.get(path);

        if (
          existing &&
          !existing.pending &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified
        ) {
          stats.unchanged += 1;
        } else if (existing) {
          // Either genuinely changed on disk, or a leftover pending
          // placeholder from an interrupted scan — either way it needs
          // (re-)enrichment, without disturbing whatever's currently shown.
          toEnrich.push({ parentHandle, path, file, dirHandleId });
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
      emitProgress?.({ ...stats, currentFile: path, phase: "discovering" });
      if (i % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    await flushPlaceholders(true); // flush whatever's left

    // Missing-file detection is now free: everything needed is already in
    // the map fetched at the top of this scan, so this is an in-memory
    // diff (no extra IndexedDB round trip), and removal is one batched
    // transaction no matter how many files disappeared.
    const missing = [];
    for (const [path, song] of existingByPath) {
      if (!stillPresent.has(path)) missing.push(song);
    }
    if (missing.length) await removeSongsBatch(missing);
    const removed = missing.length;
    notify();

    const totalStats = {
      created: 0,
      updated: 0,
      unchanged: stats.unchanged,
      removed,
      errors: stats.errors,
    };

    await enrichQueued(toEnrich, {
      onProgress: emitProgress,
      totalStats,
      notify,
      sharedCaches: sharedCaches ?? createEnrichmentCaches(),
    });

    emitProgress?.cancel();
    notifyLibraryChanged(); // unconditional final flush, bypassing the throttle
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
 * Finishes enrichment for any songs still flagged pending — normally
 * left over from a scan that got interrupted (tab closed, folder
 * permission lost mid-scan) before phase 2 finished. Called once on app
 * load (see LibraryContext) regardless of the configured rescan mode, so
 * a placeholder never gets stuck showing "still loading" forever just
 * because the person's rescan setting is manual.
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
    if (!pending.length) return totalStats;

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

    await enrichQueued(queue, {
      onProgress,
      totalStats,
      notify,
      sharedCaches: createEnrichmentCaches(),
    });
    notifyLibraryChanged();
    return totalStats;
  } finally {
    endScanActivity();
  }
}
