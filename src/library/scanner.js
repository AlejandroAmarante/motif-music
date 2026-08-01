import { isSupportedFile, extensionOf } from './formats.js';
import { parseFileMetadata } from './metadataParser.js';
import { mergeLyrics } from './lyrics.js';
import { getByPath, upsertFromScan, removeByPath, getPathsForDir } from '../db/songsRepo.js';

/**
 * Recursively walks a directory handle, yielding every supported audio
 * file as { fileHandle, parentHandle, path }. parentHandle lets us look
 * for a sibling .lrc lyrics file without re-walking the tree.
 */
async function* walk(dirHandle, relativePath = '') {
  for await (const [name, handle] of dirHandle.entries()) {
    const path = relativePath ? `${relativePath}/${name}` : name;
    if (handle.kind === 'directory') {
      yield* walk(handle, path);
    } else if (isSupportedFile(name)) {
      yield { fileHandle: handle, parentHandle: dirHandle, path };
    }
  }
}

/** Reads a sidecar song.lrc next to song.mp3, if one exists. Absence is the common case, not an error. */
async function readSidecarLrc(parentHandle, fileName) {
  const lrcName = fileName.replace(/\.[^./]+$/, '') + '.lrc';
  try {
    const lrcHandle = await parentHandle.getFileHandle(lrcName);
    const lrcFile = await lrcHandle.getFile();
    return await lrcFile.text();
  } catch {
    return null; // no sidecar file — normal, not logged
  }
}

/**
 * Scans a root directory, upserting changed/new songs and removing ones
 * that disappeared since the last scan. Cooperative-yields to the event
 * loop periodically so a 250k-file library doesn't freeze the UI thread.
 *
 * If scanning ever shows up as a real jank source under profiling, this is
 * the function to move into a Web Worker — directory handles are
 * structured-cloneable, so that's a contained change, not a rewrite.
 */
export async function scanDirectory(dirHandleRecord, { onProgress } = {}) {
  const { handle, id: dirHandleId } = dirHandleRecord;
  const stillPresent = new Set();
  const stats = { scanned: 0, created: 0, updated: 0, unchanged: 0, removed: 0, errors: 0 };

  let i = 0;
  for await (const { fileHandle, parentHandle, path } of walk(handle)) {
    i += 1;
    stillPresent.add(path);
    try {
      const file = await fileHandle.getFile();
      const existing = await getByPath(path);

      if (existing && existing.size === file.size && existing.lastModified === file.lastModified) {
        stats.unchanged += 1;
      } else {
        const tags = await parseFileMetadata(file);
        const lrcText = await readSidecarLrc(parentHandle, file.name);
        tags.lyrics = mergeLyrics({ lrcText, embedded: tags.embeddedLyrics });

        const result = await upsertFromScan({
          path,
          dirHandleId,
          fileName: file.name,
          format: extensionOf(file.name),
          size: file.size,
          lastModified: file.lastModified,
          tags
        });
        stats[result.status] += 1;
      }
    } catch (err) {
      stats.errors += 1;
      console.warn(`[motif/scanner] failed on ${path}:`, err);
    }

    stats.scanned = i;
    if (onProgress && i % 10 === 0) onProgress({ ...stats, currentFile: path });
    if (i % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // Anything previously recorded for this directory that we didn't see this
  // pass has been deleted or moved out from under us.
  const knownPaths = await getPathsForDir(dirHandleId);
  for (const path of knownPaths) {
    if (!stillPresent.has(path)) {
      await removeByPath(path);
      stats.removed += 1;
    }
  }

  onProgress?.({ ...stats, currentFile: null, done: true });
  return stats;
}
