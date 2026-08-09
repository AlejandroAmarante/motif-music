// src/library/scanner.js — full rewrite: parsing (concurrent) decoupled from writing (batched, serialized)
import { isSupportedFile, extensionOf } from "./formats.js";
import { parseFileMetadata } from "./metadataParser.js";
import { mergeLyrics } from "./lyrics.js";
import { resolveFileHandles } from "./resolveFile.js";
import { mapWithConcurrency } from "./concurrency.js";
import { hashArtworkBytes } from "../db/artworkRepo.js";
import { enrichSongsBatch } from "../db/batchEnrichRepo.js";
import {
  getByPath,
  seedPlaceholder,
  removeByPath,
  getPathsForDir,
  getPendingSongs,
} from "../db/songsRepo.js";
import { notifyLibraryChanged } from "../state/libraryBus.js";
import { notifySongUpdated } from "../state/songUpdateBus.js";
import { beginScanActivity, endScanActivity } from "./scanState.js";

// How many files get read and tag-parsed at once. This is the part that's
// genuinely safe to parallelize — real file I/O with real waits, no
// shared state, no IndexedDB contention (writes are batched separately,
// see WRITE_BATCH_SIZE below). Kept modest rather than pushed higher:
// parsing is still real CPU work on the main thread (duration estimation
// especially, for some codecs), and mobile Chromium is the primary
// target.
const PARSE_CONCURRENCY = 4;

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
 * notifyLibraryChanged() triggers a real refetch of the library's sorted
 * id list (see useVirtualSongs) — calling it after every single file
 * during a large scan would mean thousands of redundant IndexedDB scans
 * competing with the scan itself. This coalesces bursts into one call
 * roughly every `minIntervalMs`, trailing-edge, so the UI still visibly
 * grows in near-real-time without that cost. Scoped to one scan/resume
 * call rather than shared globally, since scans already run sequentially.
 */
function makeThrottledNotifier(minIntervalMs = 400) {
  let last = 0;
  let timer = null;
  return () => {
    const now = Date.now();
    if (now - last >= minIntervalMs) {
      last = now;
      notifyLibraryChanged();
    } else if (!timer) {
      timer = setTimeout(
        () => {
          timer = null;
          last = Date.now();
          notifyLibraryChanged();
        },
        minIntervalMs - (now - last),
      );
    }
  };
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
 */
async function enrichQueued(queue, { onProgress, totalStats, notify }) {
  const total = queue.length;
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
        try {
          const results = await enrichSongsBatch(chunk);
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
        onProgress?.({
          ...totalStats,
          phase: "enriching",
          enrichedCount: writtenCount,
          enrichedTotal: total,
        });
      }
    });
    return writeChain;
  }

  await mapWithConcurrency(queue, PARSE_CONCURRENCY, async (item) => {
    const { parentHandle, path, file, dirHandleId } = item;
    try {
      const tags = await parseFileMetadata(file);
      const lrcText = await readSidecarLrc(parentHandle, file.name);
      tags.lyrics = mergeLyrics({ lrcText, embedded: tags.embeddedLyrics });
      const artworkHash = tags.artworkBytes
        ? await hashArtworkBytes(tags.artworkBytes)
        : null;
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
}

/**
 * Scans a root directory in two phases:
 *
 *  1. Discovery — walks the tree comparing against what's already indexed.
 *     Brand-new files are seeded as lightweight "pending" placeholder rows
 *     (visible immediately, not yet playable — see SongRow) rather than
 *     waiting on tag parsing; changed files keep showing their current
 *     (stale but valid, still-playable) data until they're re-enriched.
 *     This phase does no metadata parsing, so it stays fast even over a
 *     very large tree.
 *  2. Enrichment — the actual tag/duration/artwork work, for everything
 *     phase 1 queued up (see enrichQueued above).
 *
 * Cooperative-yields to the event loop periodically during discovery so a
 * 250k-file library doesn't freeze the UI thread.
 */
export async function scanDirectory(dirHandleRecord, { onProgress } = {}) {
  beginScanActivity();
  try {
    const { handle, id: dirHandleId } = dirHandleRecord;
    const notify = makeThrottledNotifier();

    const stillPresent = new Set();
    const toEnrich = [];
    const stats = {
      scanned: 0,
      seeded: 0,
      changed: 0,
      unchanged: 0,
      errors: 0,
    };

    let i = 0;
    for await (const { fileHandle, parentHandle, path } of walk(handle)) {
      i += 1;
      stillPresent.add(path);
      try {
        const file = await fileHandle.getFile(); // cheap: file stats only, no content read
        const existing = await getByPath(path);

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
          await seedPlaceholder({
            path,
            dirHandleId,
            fileName: file.name,
            format: extensionOf(file.name),
            size: file.size,
            lastModified: file.lastModified,
          });
          notify();
          toEnrich.push({ parentHandle, path, file, dirHandleId });
          stats.seeded += 1;
        }
      } catch (err) {
        stats.errors += 1;
        console.warn(`[motif/scanner] failed on ${path}:`, err);
      }

      stats.scanned = i;
      if (onProgress && i % 10 === 0)
        onProgress({ ...stats, currentFile: path, phase: "discovering" });
      if (i % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Anything previously recorded for this directory that we didn't see
    // this pass has been deleted or moved out from under us.
    const knownPaths = await getPathsForDir(dirHandleId);
    let removed = 0;
    for (const path of knownPaths) {
      if (!stillPresent.has(path)) {
        await removeByPath(path);
        removed += 1;
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

    await enrichQueued(toEnrich, { onProgress, totalStats, notify });

    notifyLibraryChanged(); // unconditional final flush, bypassing the throttle
    onProgress?.({ ...totalStats, currentFile: null, done: true });
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

    await enrichQueued(queue, { onProgress, totalStats, notify });
    notifyLibraryChanged();
    return totalStats;
  } finally {
    endScanActivity();
  }
}
