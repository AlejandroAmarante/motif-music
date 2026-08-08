// src/library/scanner.js — full rewrite (two-phase discover/enrich, concurrency, throttled notify, resume)
import { isSupportedFile, extensionOf } from "./formats.js";
import { parseFileMetadata } from "./metadataParser.js";
import { mergeLyrics } from "./lyrics.js";
import { resolveFileHandles } from "./resolveFile.js";
import { mapWithConcurrency } from "./concurrency.js";
import {
  getByPath,
  seedPlaceholder,
  enrichSong,
  removeByPath,
  getPathsForDir,
  getPendingSongs,
} from "../db/songsRepo.js";
import { notifyLibraryChanged } from "../state/libraryBus.js";
import { notifySongUpdated } from "../state/songUpdateBus.js";

// How many files get their tags/duration/artwork parsed at once. This is
// the expensive, CPU/IO-heavy part of a scan (music-metadata parsing,
// SHA-256 hashing embedded artwork) — file reads and crypto.subtle.digest
// are both genuinely async, so running a handful concurrently cuts real
// wall-clock time without needing a Web Worker. If profiling ever shows
// this still isn't enough, that's the next lever — directory handles are
// structured-cloneable, so it's a contained change from here, not a
// rewrite (see the original note this replaces on scanDirectory).
const ENRICH_CONCURRENCY = 4;

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
 * Phase 2 (shared by scanDirectory and resumePendingEnrichment): the
 * expensive per-file work, run with bounded concurrency. Each item
 * already carries a live file + handles — this doesn't re-resolve
 * anything on its own.
 */
async function enrichQueued(queue, { onProgress, totalStats, notify }) {
  let done = 0;
  await mapWithConcurrency(queue, ENRICH_CONCURRENCY, async (item) => {
    const { fileHandle, parentHandle, path, file, isNew, dirHandleId } = item;
    try {
      const tags = await parseFileMetadata(file);
      const lrcText = await readSidecarLrc(parentHandle, file.name);
      tags.lyrics = mergeLyrics({ lrcText, embedded: tags.embeddedLyrics });

      const song = await enrichSong({
        path,
        dirHandleId,
        fileName: file.name,
        format: extensionOf(file.name),
        size: file.size,
        lastModified: file.lastModified,
        tags,
      });
      totalStats[isNew ? "created" : "updated"] += 1;
      notifySongUpdated(song); // flips this exact row from pending -> ready, wherever it's rendered
    } catch (err) {
      totalStats.errors += 1;
      console.warn(`[motif/scanner] failed to enrich ${path}:`, err);
    } finally {
      done += 1;
      notify();
      onProgress?.({
        ...totalStats,
        currentFile: path,
        phase: "enriching",
        enrichedCount: done,
        enrichedTotal: queue.length,
      });
    }
  });
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
 *     phase 1 queued up, run concurrently (see enrichQueued above).
 *
 * Cooperative-yields to the event loop periodically during discovery so a
 * 250k-file library doesn't freeze the UI thread.
 */
export async function scanDirectory(dirHandleRecord, { onProgress } = {}) {
  const { handle, id: dirHandleId } = dirHandleRecord;
  const notify = makeThrottledNotifier();

  const stillPresent = new Set();
  const toEnrich = [];
  const stats = { scanned: 0, seeded: 0, changed: 0, unchanged: 0, errors: 0 };

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
        toEnrich.push({
          fileHandle,
          parentHandle,
          path,
          file,
          isNew: false,
          dirHandleId,
        });
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
        toEnrich.push({
          fileHandle,
          parentHandle,
          path,
          file,
          isNew: true,
          dirHandleId,
        });
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
        fileHandle,
        parentHandle,
        path: song.path,
        file,
        isNew: true,
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
}
