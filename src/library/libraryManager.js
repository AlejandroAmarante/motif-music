import {
  addDirectoryHandle,
  getAllDirectoryHandles,
  touchLastScanned,
  removeDirectoryHandle,
  ensurePermission,
} from "../db/directoryHandlesRepo.js";
import { scanDirectory } from "./scanner.js";
import { createEnrichmentCaches } from "../db/batchEnrichRepo.js";
import { getMotifFolderId, setMotifFolderId } from "../setup/setupState.js";

export const MOTIF_FOLDER_NAME = "motif-music";

export class DuplicateFolderError extends Error {
  constructor(existingFolder) {
    super(`"${existingFolder.name}" is already connected.`);
    this.name = "DuplicateFolderError";
    this.existingFolder = existingFolder;
  }
}

export function isFileSystemAccessSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Compares a freshly-picked handle against every registered folder so the same directory can't be connected twice. Falls back to "not a duplicate" if the browser lacks isSameEntry, rather than blocking the flow. */
async function findExistingRecordFor(handle) {
  const existing = await getAllDirectoryHandles();
  for (const record of existing) {
    try {
      if (await handle.isSameEntry(record.handle)) return record;
    } catch {
      // isSameEntry unsupported or threw — treat as not a match.
    }
  }
  return null;
}

/** Opens the native folder picker and registers the chosen folder as a library root. */
export async function addLibraryFolder() {
  const handle = await window.showDirectoryPicker({ mode: "read" });
  const granted = await ensurePermission(handle);
  if (!granted) throw new Error("Permission to read the folder was denied.");

  const duplicate = await findExistingRecordFor(handle);
  if (duplicate) throw new DuplicateFolderError(duplicate);

  return addDirectoryHandle(handle);
}

/**
 * Creates (or reuses) a "motif-music" folder inside a location the user
 * picks, and registers it as a library root. The File System Access API
 * has no "create a folder with zero user interaction" primitive — every
 * write needs a user gesture and an explicit parent — so this asks the
 * user where the folder should live, then creates/opens motif-music
 * inside it.
 */
export async function createMotifMusicFolder() {
  const parent = await window.showDirectoryPicker({ mode: "readwrite" });
  const granted = await ensurePermission(parent, "readwrite");
  if (!granted) throw new Error("Permission to create the folder was denied.");

  const motifHandle = await parent.getDirectoryHandle(MOTIF_FOLDER_NAME, {
    create: true,
  });

  const duplicate = await findExistingRecordFor(motifHandle);
  if (duplicate) {
    await setMotifFolderId(duplicate.id);
    return duplicate;
  }

  const record = await addDirectoryHandle(motifHandle);
  await setMotifFolderId(record.id);
  return record;
}

/**
 * True if a folder named "motif-music" is already connected — whether the
 * app created it via createMotifMusicFolder(), or the user separately
 * connected an existing folder that happens to have that name via "Use
 * Existing Folder". Either way it's treated as the active Motif folder, so
 * the UI never offers to create a second one on top of it.
 */
export async function hasMotifMusicFolder() {
  const all = await getAllDirectoryHandles();

  const id = await getMotifFolderId();
  if (id) {
    if (all.some((f) => f.id === id)) return true;
    await setMotifFolderId(null); // stale reference — the folder was disconnected
  }

  const byName = all.find((f) => f.name === MOTIF_FOLDER_NAME);
  if (byName) {
    await setMotifFolderId(byName.id);
    return true;
  }

  return false;
}

export async function listLibraryFolders() {
  return getAllDirectoryHandles();
}

export async function removeLibraryFolder(id) {
  return removeDirectoryHandle(id);
}

/**
 * Scans every registered root, re-requesting permission per folder as
 * needed. One enrichment-cache set (see createEnrichmentCaches) is
 * created here and shared across every folder in this run, so an artist
 * or album that spans more than one connected folder — or more than one
 * batch within a folder — resolves against IndexedDB once per scan, not
 * once per batch.
 */
export async function scanAllFolders({
  onProgress,
  onFolderStart,
  onFolderDone,
} = {}) {
  const folders = await getAllDirectoryHandles();
  const overall = {
    created: 0,
    updated: 0,
    unchanged: 0,
    removed: 0,
    errors: 0,
  };
  const sharedCaches = createEnrichmentCaches();

  for (const folder of folders) {
    onFolderStart?.(folder);
    const granted = await ensurePermission(folder.handle);
    if (!granted) {
      onFolderDone?.(folder, { skipped: true, reason: "permission-denied" });
      continue;
    }

    const stats = await scanDirectory(folder, {
      onProgress: (progress) => onProgress?.(folder, progress),
      sharedCaches,
    });

    for (const key of Object.keys(overall)) overall[key] += stats[key] || 0;
    await touchLastScanned(folder.id);
    onFolderDone?.(folder, stats);
  }

  return overall;
}

/** True if a scanAllFolders() result found no music at all — used right after setup adds the first folder, to decide whether to offer the sample track. */
export function scanFoundNoMusic(stats) {
  return (
    (stats.created || 0) + (stats.updated || 0) + (stats.unchanged || 0) === 0
  );
}
