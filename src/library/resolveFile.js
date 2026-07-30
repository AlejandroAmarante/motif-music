import { getAllDirectoryHandles, ensurePermission } from '../db/directoryHandlesRepo.js';

const dirCache = new Map(); // dirHandleId -> directory record

async function getDirRecord(dirHandleId) {
  if (dirCache.has(dirHandleId)) return dirCache.get(dirHandleId);
  const all = await getAllDirectoryHandles();
  all.forEach((d) => dirCache.set(d.id, d));
  return dirCache.get(dirHandleId) ?? null;
}

/**
 * Walks a song's stored path (relative to its library root) back to a live
 * File handle. We never copy or cache audio bytes ourselves — this always
 * reads straight from the user's disk.
 */
export async function resolveFile(song) {
  const dirRecord = await getDirRecord(song.dirHandleId);
  if (!dirRecord) throw new Error('The folder this song belongs to is no longer connected.');

  const granted = await ensurePermission(dirRecord.handle);
  if (!granted) throw new Error('Permission to read this file was denied.');

  const segments = song.path.split('/');
  let current = dirRecord.handle;
  for (let i = 0; i < segments.length - 1; i += 1) {
    current = await current.getDirectoryHandle(segments[i]);
  }
  const fileHandle = await current.getFileHandle(segments[segments.length - 1]);
  return fileHandle.getFile();
}
